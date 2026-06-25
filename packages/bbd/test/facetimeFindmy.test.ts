import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FaceTimeService } from "../src/facetime/FaceTimeService";
import { FindMyService } from "../src/findmy/FindMyService";
import { FindMyDevicesReader } from "../src/findmy/FindMyDevicesReader";
import { buildFaceTimeOperations } from "../src/api/operations/facetimeOperations";
import { buildFindMyOperations } from "../src/api/operations/findmyOperations";
import { executeOperation } from "../src/api/execute";
import type { PrivateApiTransport, TransportRequest, TransportResponse } from "../src/private-api/PrivateApiTransport";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

class FakeTransport implements PrivateApiTransport {
    connected = true;
    requests: TransportRequest[] = [];
    response: TransportResponse = {};
    async send(req: TransportRequest): Promise<TransportResponse> {
        this.requests.push(req);
        return this.response;
    }
    isConnected(): boolean {
        return this.connected;
    }
    onEvent(): void {}
    async stop(): Promise<void> {}
}

test("FaceTime answer/leave/createLink route to the right actions", async () => {
    const t = new FakeTransport();
    t.response = { data: { link: "https://facetime.apple.com/abc" } };
    const ft = buildFaceTimeOperations({ facetime: new FaceTimeService(t, silent) });
    const by = (n: string) => ft.find(o => o.name === n)!;

    await executeOperation(by("answer-facetime"), { input: { uuid: "u1" }, credential: "pw" }, ctx, auth);
    await executeOperation(by("leave-facetime"), { input: { uuid: "u1" }, credential: "pw" }, ctx, auth);
    const link = await executeOperation(by("create-facetime-link"), { input: {}, credential: "pw" }, ctx, auth);

    assert.deepEqual(t.requests.map(r => r.action), ["answer-facetime", "leave-facetime", "create-facetime-link"]);
    assert.equal((link.data as { link: string }).link, "https://facetime.apple.com/abc");
});

test("FaceTime errors cleanly when the helper isn't connected", async () => {
    const t = new FakeTransport();
    t.connected = false;
    const ft = buildFaceTimeOperations({ facetime: new FaceTimeService(t, silent) });
    const r = await executeOperation(ft.find(o => o.name === "answer-facetime")!, { input: { uuid: "u" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 500);
    assert.match(r.error?.message ?? "", /requires the Private API/);
});

test("FindMy refresh caches friends; get returns the cache", async () => {
    const t = new FakeTransport();
    t.response = { data: { locations: [{ handle: "alice", coordinates: [1, 2] }] } };
    // `false` = Private API path (the host may be macOS 14.4+, where the default gate decrypts).
    const svc = new FindMyService(t, silent, false);
    const devices = new FindMyDevicesReader("/nonexistent/Items.data");
    const fm = buildFindMyOperations({ findmy: svc, devices });
    const by = (n: string) => fm.find(o => o.name === n)!;

    assert.deepEqual((await executeOperation(by("get-findmy-friends"), { input: {}, credential: "pw" }, ctx, auth)).data, {
        friends: []
    });
    const refreshed = await executeOperation(by("refresh-findmy-friends"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal((refreshed.data as { friends: unknown[] }).friends.length, 1);
    const cached = await executeOperation(by("get-findmy-friends"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal((cached.data as { friends: unknown[] }).friends.length, 1);
});

test("FindMy devices reader parses the plaintext cache file and degrades to [] on absence", async () => {
    const file = path.join(os.tmpdir(), `bbd-findmy-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(
        file,
        JSON.stringify([{ name: "iPhone", deviceModel: "iPhone15,2", batteryLevel: 0.8, location: { latitude: 1, longitude: 2 } }])
    );
    try {
        // `false` = plaintext path (the host may be macOS 14.4+, where the default gate would decrypt).
        const devices = await new FindMyDevicesReader(file, false).read();
        assert.equal(devices.length, 1);
        assert.equal(devices[0]!.name, "iPhone");
        assert.deepEqual(devices[0]!.coordinates, [1, 2]);
    } finally {
        fs.rmSync(file, { force: true });
    }
    assert.deepEqual(await new FindMyDevicesReader("/definitely/missing.json", false).read(), []);
});
