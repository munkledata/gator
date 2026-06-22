import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryWebhookStore } from "../src/webhooks/Webhook";
import { WebhookSubscriber } from "../src/webhooks/WebhookSubscriber";
import { buildWebhookOperations } from "../src/api/operations/webhookOperations";
import { WebhookDispatcher, isPublicHttpUrl, type WebhookFetch } from "../src/networking/webhook";
import { wireMessageFanout } from "../src/serialize/messageFanout";
import { FileCursorStore } from "../src/data/imessage/FileCursorStore";
import { EventBus } from "../src/core/bus";
import { executeOperation } from "../src/api/execute";
import { createConsoleLogger } from "../src/core/logger";
import type { DomainEvents } from "../src/events";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

test("webhook create/list/delete operations", async () => {
    const store = new InMemoryWebhookStore();
    const ops = buildWebhookOperations({ store });
    const by = (n: string) => ops.find(o => o.name === n)!;

    const created = await executeOperation(
        by("create-webhook"),
        { input: { url: "https://hook.example.com", events: ["new-message"] }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(created.status, 200);
    const id = (created.data as { id: string }).id;
    assert.equal((await store.list()).length, 1);

    const del = await executeOperation(by("delete-webhook"), { input: { id }, credential: "pw" }, ctx, auth);
    assert.equal((del.data as { removed: boolean }).removed, true);
});

test("subscriber dispatches only to webhooks subscribed to the event (or '*')", async () => {
    const store = new InMemoryWebhookStore();
    await store.create({ url: "https://all.example.com", events: ["*"] });
    await store.create({ url: "https://msg.example.com", events: ["new-message"] });
    await store.create({ url: "https://other.example.com", events: ["typing-indicator"] });

    const hits: string[] = [];
    const fetchImpl: WebhookFetch = async url => {
        hits.push(url);
        return { ok: true, status: 200 };
    };
    const dispatcher = new WebhookDispatcher({ logger: silent, fetch: fetchImpl, sleep: async () => {} });
    const sub = new WebhookSubscriber(store, dispatcher, silent);

    await sub.onEvent("new-message", { guid: "g" });
    assert.deepEqual(hits.sort(), ["https://all.example.com", "https://msg.example.com"]);
});

test("message fanout serializes once and delivers to both sinks", () => {
    const bus = new EventBus<DomainEvents>();
    const emitted: { type: string; dto: { guid: string } }[] = [];
    const hooked: { type: string; dto: { guid: string } }[] = [];
    wireMessageFanout(bus, {
        emit: (type, dto) => emitted.push({ type, dto: dto as { guid: string } }),
        webhook: (type, dto) => void hooked.push({ type, dto: dto as { guid: string } })
    });
    bus.emit("new-message", { guid: "g1", text: "hi", associated_message_type: 2000 });
    assert.equal(emitted[0]!.type, "new-message");
    assert.equal(emitted[0]!.dto.guid, "g1");
    assert.deepEqual(emitted[0]!.dto, hooked[0]!.dto, "same serialized DTO to both sinks");
});

test("live fanout carries hydrated chats[]/handle + top-level chatGuid (audit F1)", async () => {
    const bus = new EventBus<DomainEvents>();
    const emitted: Array<{ type: string; dto: Record<string, unknown> }> = [];
    const hooked: Array<{ type: string; dto: Record<string, unknown> }> = [];
    const pushed: Array<{ type: string; dto: Record<string, unknown> }> = [];

    wireMessageFanout(bus, {
        emit: (type, dto) => emitted.push({ type, dto: dto as Record<string, unknown> }),
        webhook: (type, dto) => void hooked.push({ type, dto: dto as Record<string, unknown> }),
        notify: (type, dto) => void pushed.push({ type, dto: dto as Record<string, unknown> }),
        // Stand-in for backend's chatReader/handleReader batch lookup.
        hydrate: row => {
            assert.equal(Number(row.ROWID), 42);
            return {
                chats: [{ guid: "iMessage;-;+15551234567", chat_identifier: "+15551234567", display_name: "Alice" }],
                handle: { id: "+15551234567", service: "iMessage" }
            };
        }
    });

    bus.emit("new-message", { ROWID: 42, guid: "g-live", text: "hi", handle_id: 7, is_from_me: 0 });
    // let the .catch-wrapped sinks settle
    await Promise.resolve();

    const dto = emitted[0]!.dto;
    assert.equal(dto.guid, "g-live");
    assert.equal(dto.chatGuid, "iMessage;-;+15551234567", "top-level chatGuid (belt-and-suspenders)");
    assert.deepEqual((dto.chats as Array<{ guid: string }>)[0]!.guid, "iMessage;-;+15551234567", "hydrated chats[]");
    assert.ok(dto.handle, "hydrated sender handle");
    // The SAME enriched dto reaches the socket, webhook, AND push sinks.
    assert.deepEqual(emitted[0]!.dto, hooked[0]!.dto);
    assert.deepEqual(emitted[0]!.dto, pushed[0]!.dto);
});

test("live fanout still emits (without chats[]) when hydration throws (audit F1/F19)", () => {
    const bus = new EventBus<DomainEvents>();
    const emitted: Array<Record<string, unknown>> = [];
    wireMessageFanout(bus, {
        emit: (_t, dto) => emitted.push(dto as Record<string, unknown>),
        webhook: () => {},
        logger: silent,
        hydrate: () => {
            throw new Error("chat.db read blew up");
        }
    });
    bus.emit("new-message", { ROWID: 1, guid: "g-degraded" });
    assert.equal(emitted[0]!.guid, "g-degraded", "event is not dropped");
    assert.equal(emitted[0]!.chatGuid, undefined, "no chatGuid when hydration failed");
    assert.equal("chats" in emitted[0]!, false, "no chats[] when hydration failed");
});

test("FileCursorStore round-trips the cursor and resets on a missing file", async () => {
    const file = path.join(os.tmpdir(), `bbd-cursor-${process.pid}-${Date.now()}.json`);
    const store = new FileCursorStore(file);
    assert.equal((await store.load()).lastRowId, 0); // missing -> initial
    try {
        await store.save({ lastRowId: 42, maxDate: 100, maxDateEdited: 0, maxDateRetracted: 0, maxDateDelivered: 0, maxDateRead: 0 });
        assert.equal((await store.load()).lastRowId, 42);
    } finally {
        fs.rmSync(file, { force: true });
    }
});

test("isPublicHttpUrl blocks SSRF targets and non-http schemes (audit S5)", () => {
    // Allowed: public http(s) hosts.
    assert.equal(isPublicHttpUrl("https://hooks.example.com/x"), true);
    assert.equal(isPublicHttpUrl("http://93.184.216.34/x"), true);
    // Blocked: loopback, private ranges, link-local/metadata, localhost, schemes.
    assert.equal(isPublicHttpUrl("http://127.0.0.1:1234/api/v1/admin/command"), false);
    assert.equal(isPublicHttpUrl("http://localhost/x"), false);
    assert.equal(isPublicHttpUrl("http://10.0.0.5/x"), false);
    assert.equal(isPublicHttpUrl("http://192.168.1.1/x"), false);
    assert.equal(isPublicHttpUrl("http://172.16.0.1/x"), false);
    assert.equal(isPublicHttpUrl("http://169.254.169.254/latest/meta-data"), false);
    assert.equal(isPublicHttpUrl("http://[::1]/x"), false);
    assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
    assert.equal(isPublicHttpUrl("gopher://x"), false);
    assert.equal(isPublicHttpUrl("not a url"), false);
});

test("WebhookDispatcher refuses a disallowed target when an allow guard is set (audit S5)", async () => {
    let calls = 0;
    const fetch: WebhookFetch = async () => {
        calls++;
        return { ok: true, status: 200 };
    };
    const d = new WebhookDispatcher({ logger: silent, fetch, allow: isPublicHttpUrl });
    const ok = await d.dispatch({ url: "http://169.254.169.254/" }, { type: "new-message", data: {} });
    assert.equal(ok, false);
    assert.equal(calls, 0, "disallowed target is never fetched");
});
