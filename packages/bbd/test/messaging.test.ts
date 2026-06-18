import { test } from "node:test";
import assert from "node:assert/strict";
import { MessageSender } from "../src/messaging/MessageSender";
import { AppleScriptFallback, type AppleScriptRunner } from "../src/messaging/appleScriptFallback";
import type { PrivateApiTransport, TransportRequest, TransportResponse } from "../src/private-api/PrivateApiTransport";
import { serializeMessage } from "../src/serialize/messageSerializer";
import { unixMsToAppleNanos } from "../src/data/imessage/appleConstants";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });

class FakeTransport implements PrivateApiTransport {
    connected = true;
    lastRequest?: TransportRequest;
    response: TransportResponse = { identifier: "GUID-1" };
    async send(req: TransportRequest): Promise<TransportResponse> {
        this.lastRequest = req;
        return this.response;
    }
    isConnected(): boolean {
        return this.connected;
    }
    onEvent(): void {}
    async stop(): Promise<void> {}
}

class FakeRunner implements AppleScriptRunner {
    calls: { script: string; args: readonly string[] }[] = [];
    async run(script: string, args: readonly string[]): Promise<string> {
        this.calls.push({ script, args });
        return "";
    }
}

test("sendText via the Private API returns the GUID ack", async () => {
    const t = new FakeTransport();
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    const res = await sender.sendText({ chatGuid: "c", text: "hi" });
    assert.equal(res.viaPrivateApi, true);
    assert.equal(res.guid, "GUID-1");
    assert.equal(t.lastRequest?.action, "send-message");
});

test("sendText falls back to AppleScript with positional args (no interpolation)", async () => {
    const t = new FakeTransport();
    t.connected = false;
    const runner = new FakeRunner();
    const sender = new MessageSender(t, new AppleScriptFallback(runner, silent), silent);
    const res = await sender.sendText({ chatGuid: "c", text: "hi" });
    assert.equal(res.viaPrivateApi, false);
    assert.deepEqual(runner.calls[0]!.args, ["c", "hi"]);
});

test("sendReaction requires the Private API", async () => {
    const t = new FakeTransport();
    t.connected = false;
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    await assert.rejects(
        () => sender.sendReaction({ chatGuid: "c", messageGuid: "m", reactionType: "love" }),
        /require the Private API/
    );
});

test("a Private-API error surfaces to the caller", async () => {
    const t = new FakeTransport();
    t.response = { error: "send failed" };
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    await assert.rejects(() => sender.sendText({ chatGuid: "c", text: "x" }), /send failed/);
});

test("serializeMessage projects a row to the v1 DTO with date + reaction decoding", () => {
    const dto = serializeMessage({
        guid: "g1",
        text: "hello",
        date: unixMsToAppleNanos(Date.UTC(2026, 0, 1)),
        is_from_me: 1,
        is_read: 1,
        associated_message_type: 0
    });
    assert.equal(dto.guid, "g1");
    assert.equal(dto.text, "hello");
    assert.equal(dto.dateCreated, Date.UTC(2026, 0, 1));
    assert.equal(dto.isFromMe, true);
    assert.equal(dto.reaction, null);

    const tapback = serializeMessage({ guid: "g", associated_message_type: 2000 });
    assert.equal(tapback.reaction, "love");
});

test("serializeMessage maps missing columns to null without throwing", () => {
    const dto = serializeMessage({ guid: "g" });
    assert.equal(dto.text, null);
    assert.equal(dto.dateCreated, null);
    assert.equal(dto.isFromMe, false);
});
