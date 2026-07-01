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

test("createChat sends create-chat with addresses + message and returns the new chat guid", async () => {
    const t = new FakeTransport();
    t.response = { data: { chatGuid: "iMessage;-;+15551234567" } };
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    const res = await sender.createChat({ addresses: ["+15551234567"], message: "hey", service: "iMessage" });
    assert.equal(res.guid, "iMessage;-;+15551234567");
    assert.equal(t.lastRequest?.action, "create-chat");
    assert.deepEqual(t.lastRequest?.data, {
        addresses: ["+15551234567"],
        service: "iMessage",
        message: "hey"
    });
});

test("createChat throws when the helper returns no chat guid, and requires the Private API", async () => {
    const t = new FakeTransport();
    t.response = { data: {} };
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    await assert.rejects(() => sender.createChat({ addresses: ["x@y.com"], message: "hi" }), /no chat guid/);
    t.connected = false;
    await assert.rejects(() => sender.createChat({ addresses: ["x@y.com"], message: "hi" }), /requires the Private API/);
});

test("sendText forwards fidelity fields (effect, reply, ddScan) and omits undefined", async () => {
    const t = new FakeTransport();
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    await sender.sendText({
        chatGuid: "c",
        text: "hi",
        effectId: "com.apple.MobileSMS.expressivesend.impact",
        selectedMessageGuid: "reply-to-guid",
        ddScan: true,
        tempGuid: "temp-1"
    });
    const data = t.lastRequest?.data as Record<string, unknown>;
    assert.equal(data.effectId, "com.apple.MobileSMS.expressivesend.impact");
    assert.equal(data.selectedMessageGuid, "reply-to-guid");
    assert.equal(data.ddScan, true);
    assert.equal(data.tempGuid, "temp-1");
    assert.equal("subject" in data, false, "undefined fields are not sent");
});

test("sendAttachment writes bytes to a temp file, sends, and returns the GUID ack", async () => {
    const t = new FakeTransport();
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    const res = await sender.sendAttachment({
        chatGuid: "c",
        name: "pic.png",
        dataBase64: Buffer.from("hello-bytes").toString("base64")
    });
    assert.equal(res.guid, "GUID-1");
    assert.equal(t.lastRequest?.action, "send-attachment");
    const data = t.lastRequest?.data as Record<string, unknown>;
    assert.equal(data.chatGuid, "c");
    assert.equal(data.attachmentName, "pic.png");
    assert.match(String(data.attachmentPath), /pic\.png$/);
});

test("sendAttachment requires the Private API (no AppleScript fallback)", async () => {
    const t = new FakeTransport();
    t.connected = false;
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    await assert.rejects(
        () => sender.sendAttachment({ chatGuid: "c", name: "f.bin", dataBase64: "AAAA" }),
        /requires the Private API/
    );
});

test("sendReaction requires the Private API", async () => {
    const t = new FakeTransport();
    t.connected = false;
    const sender = new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);
    await assert.rejects(
        () => sender.sendReaction({ chatGuid: "c", messageGuid: "m", reactionType: "love" }),
        /requires the Private API/
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
    // associated_message_type 0 serializes to null (legacy ReactionIdToString)
    assert.equal(dto.associatedMessageType, null);

    // reaction codes become their legacy string name (NOT a number — wire compat)
    assert.equal(serializeMessage({ guid: "g", associated_message_type: 2000 }).associatedMessageType, "love");
    assert.equal(serializeMessage({ guid: "g", associated_message_type: 3001 }).associatedMessageType, "-like");
    // non-reaction codes become the stringified number
    assert.equal(serializeMessage({ guid: "g", associated_message_type: 5 }).associatedMessageType, "5");
});

test("serializeMessage maps missing columns to null without throwing", () => {
    const dto = serializeMessage({ guid: "g" });
    assert.equal(dto.text, null);
    assert.equal(dto.dateCreated, null);
    assert.equal(dto.isFromMe, false);
    // delivered-tier flags default to false when the columns are absent (older macOS)
    assert.equal(dto.wasDeliveredQuietly, false);
    assert.equal(dto.didNotifyRecipient, false);
});

test("serializeMessage emits the Apple delivered-tier flags", () => {
    const dto = serializeMessage({ guid: "g", was_delivered_quietly: 1, did_notify_recipient: 0 });
    assert.equal(dto.wasDeliveredQuietly, true);
    assert.equal(dto.didNotifyRecipient, false);
});
