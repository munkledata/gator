import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryWebhookStore } from "../src/webhooks/Webhook";
import { WebhookSubscriber } from "../src/webhooks/WebhookSubscriber";
import { buildWebhookOperations } from "../src/api/operations/webhookOperations";
import { WebhookDispatcher, type WebhookFetch } from "../src/networking/webhook";
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
