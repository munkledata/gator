import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActionOperations } from "../src/api/operations/actionOperations";
import { executeOperation } from "../src/api/execute";
import { MessageSender } from "../src/messaging/MessageSender";
import { AppleScriptFallback, type AppleScriptRunner } from "../src/messaging/appleScriptFallback";
import type { PrivateApiTransport, TransportRequest, TransportResponse } from "../src/private-api/PrivateApiTransport";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

class FakeTransport implements PrivateApiTransport {
    connected = true;
    requests: TransportRequest[] = [];
    response: TransportResponse = { identifier: "GUID-1" };
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

class FakeRunner implements AppleScriptRunner {
    calls: { args: readonly string[] }[] = [];
    async run(_script: string, args: readonly string[]): Promise<string> {
        this.calls.push({ args });
        return "";
    }
}

function setup(connected = true) {
    const transport = new FakeTransport();
    transport.connected = connected;
    const runner = new FakeRunner();
    const sender = new MessageSender(transport, new AppleScriptFallback(runner, silent), silent);
    const list = buildActionOperations({ sender });
    return { transport, runner, by: (n: string) => list.find(o => o.name === n)! };
}

test("send-message routes to the Private API and returns the GUID", async () => {
    const { transport, by } = setup();
    const r = await executeOperation(by("send-message"), { input: { chatGuid: "c", text: "hi" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    assert.equal((r.data as { guid: string }).guid, "GUID-1");
    assert.equal(transport.requests[0]!.action, "send-message");
});

test("send-reaction / edit / unsend / typing / read map to the right actions", async () => {
    const { transport, by } = setup();
    await executeOperation(by("send-reaction"), { input: { chatGuid: "c", messageGuid: "m", reactionType: "love" }, credential: "pw" }, ctx, auth);
    await executeOperation(by("start-typing"), { input: { guid: "c" }, credential: "pw" }, ctx, auth);
    await executeOperation(by("stop-typing"), { input: { guid: "c" }, credential: "pw" }, ctx, auth);
    await executeOperation(by("mark-chat-read"), { input: { guid: "c" }, credential: "pw" }, ctx, auth);
    await executeOperation(by("edit-message"), { input: { guid: "m", chatGuid: "c", editedText: "new" }, credential: "pw" }, ctx, auth);
    await executeOperation(by("unsend-message"), { input: { guid: "m", chatGuid: "c" }, credential: "pw" }, ctx, auth);
    assert.deepEqual(
        transport.requests.map(r => r.action),
        ["send-reaction", "start-typing", "stop-typing", "mark-chat-read", "edit-message", "unsend-message"]
    );
});

test("fidelity actions fail cleanly when the helper isn't connected", async () => {
    const { by } = setup(false);
    const r = await executeOperation(by("send-reaction"), { input: { chatGuid: "c", messageGuid: "m", reactionType: "love" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 500);
    assert.match(r.error?.message ?? "", /requires the Private API/);
});

test("send-message falls back to AppleScript for plain text when not connected", async () => {
    const { runner, by } = setup(false);
    const r = await executeOperation(by("send-message"), { input: { chatGuid: "c", text: "hi" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    assert.equal((r.data as { viaPrivateApi: boolean }).viaPrivateApi, false);
    assert.deepEqual(runner.calls[0]!.args, ["c", "hi"]);
});

test("action operations require auth and validate input", async () => {
    const { by } = setup();
    assert.equal((await executeOperation(by("send-message"), { input: { chatGuid: "c" } }, ctx, auth)).status, 401);
    assert.equal((await executeOperation(by("send-reaction"), { input: { chatGuid: "c" }, credential: "pw" }, ctx, auth)).status, 400);
});
