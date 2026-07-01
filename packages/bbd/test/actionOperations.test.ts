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

// Minimal chat reader: one known chat with a single participant, for the group-mutation
// read-back. Unknown guids return undefined (→ NotFoundError → 404).
const fakeChatReader = {
    getChatByGuid(guid: string) {
        return guid === "c" ? { ROWID: 1, guid: "c", display_name: "Group" } : undefined;
    },
    getParticipants(rowIds: number[]) {
        const m = new Map<number, Record<string, unknown>[]>();
        if (rowIds.includes(1)) m.set(1, [{ ROWID: 10, id: "+15551234567" }]);
        return m;
    }
};

function setup(connected = true) {
    const transport = new FakeTransport();
    transport.connected = connected;
    const runner = new FakeRunner();
    const sender = new MessageSender(transport, new AppleScriptFallback(runner, silent), silent);
    const list = buildActionOperations({ sender, chatReader: fakeChatReader });
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

test("group management maps to the right helper actions and returns the updated chat", async () => {
    const { transport, by } = setup();
    const rn = await executeOperation(by("rename-chat"), { input: { guid: "c", displayName: "New" }, credential: "pw" }, ctx, auth);
    assert.equal(rn.status, 200);
    assert.equal((rn.data as { chat: { guid: string } }).chat.guid, "c");

    const add = await executeOperation(by("update-participant"), { input: { guid: "c", action: "add", address: "+15550001111" }, credential: "pw" }, ctx, auth);
    assert.equal(add.status, 200);
    const rm = await executeOperation(by("update-participant"), { input: { guid: "c", action: "remove", address: "+15550001111" }, credential: "pw" }, ctx, auth);
    assert.equal(rm.status, 200);

    const lv = await executeOperation(by("leave-chat"), { input: { guid: "c" }, credential: "pw" }, ctx, auth);
    assert.equal(lv.status, 200);
    assert.equal((lv.data as { left: boolean }).left, true);

    assert.deepEqual(
        transport.requests.map(r => r.action),
        ["set-display-name", "add-participant", "remove-participant", "leave-chat"]
    );
});

test("group mutation on an unknown chat is a 404", async () => {
    const { by } = setup();
    const r = await executeOperation(by("rename-chat"), { input: { guid: "nope", displayName: "x" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 404);
});

test("update-participant rejects a bad action", async () => {
    const { by } = setup();
    const r = await executeOperation(by("update-participant"), { input: { guid: "c", action: "banana", address: "a" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 400);
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
