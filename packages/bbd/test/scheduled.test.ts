import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryScheduledMessageStore } from "../src/scheduled/ScheduledMessage";
import { Scheduler } from "../src/scheduled/Scheduler";
import { buildScheduledOperations } from "../src/api/operations/scheduledOperations";
import { executeOperation } from "../src/api/execute";
import { MessageSender } from "../src/messaging/MessageSender";
import { AppleScriptFallback, type AppleScriptRunner } from "../src/messaging/appleScriptFallback";
import type { PrivateApiTransport, TransportRequest, TransportResponse } from "../src/private-api/PrivateApiTransport";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

class FakeTransport implements PrivateApiTransport {
    requests: TransportRequest[] = [];
    response: TransportResponse = { identifier: "GUID" };
    async send(req: TransportRequest): Promise<TransportResponse> {
        this.requests.push(req);
        return this.response;
    }
    isConnected(): boolean {
        return true;
    }
    onEvent(): void {}
    async stop(): Promise<void> {}
}
class FakeRunner implements AppleScriptRunner {
    async run(): Promise<string> {
        return "";
    }
}
const senderWith = (t: PrivateApiTransport) => new MessageSender(t, new AppleScriptFallback(new FakeRunner(), silent), silent);

test("scheduler sends only due messages and marks them sent", async () => {
    const store = new InMemoryScheduledMessageStore();
    await store.create({ chatGuid: "c", text: "due", scheduledFor: 1000 });
    await store.create({ chatGuid: "c", text: "future", scheduledFor: 100_000 });
    const transport = new FakeTransport();
    const scheduler = new Scheduler(store, senderWith(transport), silent, { now: () => 5000 });

    assert.equal(await scheduler.tick(), 1);
    const all = await store.list();
    assert.equal(all.find(m => m.text === "due")!.status, "sent");
    assert.equal(all.find(m => m.text === "future")!.status, "pending");
    assert.equal(transport.requests[0]!.action, "send-message");

    // a second tick at the same time sends nothing new
    assert.equal(await scheduler.tick(), 0);
});

test("a send failure marks the message failed (and is not retried as pending)", async () => {
    const store = new InMemoryScheduledMessageStore();
    await store.create({ chatGuid: "c", text: "x", scheduledFor: 0 });
    const transport = new FakeTransport();
    transport.response = { error: "boom" };
    await new Scheduler(store, senderWith(transport), silent, { now: () => 1000 }).tick();
    const msg = (await store.list())[0]!;
    assert.equal(msg.status, "failed");
    assert.equal(msg.error, "boom");
});

test("create/list/delete operations", async () => {
    const store = new InMemoryScheduledMessageStore();
    const ops = buildScheduledOperations({ store });
    const by = (n: string) => ops.find(o => o.name === n)!;

    const created = await executeOperation(
        by("create-scheduled-message"),
        { input: { chatGuid: "c", text: "hi", scheduledFor: 9_999_999_999_999 }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(created.status, 200);
    const id = (created.data as { id: string }).id;

    const listed = await executeOperation(by("list-scheduled-messages"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal((listed.data as { scheduledMessages: unknown[] }).scheduledMessages.length, 1);

    const del = await executeOperation(by("delete-scheduled-message"), { input: { id }, credential: "pw" }, ctx, auth);
    assert.equal((del.data as { removed: boolean }).removed, true);
    assert.equal((await store.list()).length, 0);
});

test("create-scheduled-message validates input", async () => {
    const ops = buildScheduledOperations({ store: new InMemoryScheduledMessageStore() });
    const op = ops.find(o => o.name === "create-scheduled-message")!;
    assert.equal((await executeOperation(op, { input: { chatGuid: "c", text: "hi" }, credential: "pw" }, ctx, auth)).status, 400);
});
