import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ChatReader } from "../src/data/imessage/ChatReader";
import { introspectTable } from "../src/data/imessage/schema";
import { buildReadOperations } from "../src/api/operations/readOperations";
import { executeOperation } from "../src/api/execute";
import { createConsoleLogger } from "../src/core/logger";

const ctx = { logger: createConsoleLogger("t", { level: "fatal" }) };
const auth = { password: "pw" };

function seed(): Database.Database {
    const db = new Database(":memory:");
    db.exec(`
        CREATE TABLE chat(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, chat_identifier TEXT,
            display_name TEXT, style INTEGER, is_archived INTEGER DEFAULT 0, group_id TEXT);
        CREATE TABLE message(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, text TEXT, date INTEGER,
            is_from_me INTEGER DEFAULT 0, associated_message_type INTEGER DEFAULT 0);
        CREATE TABLE chat_message_join(chat_id INTEGER, message_id INTEGER);
    `);
    db.prepare("INSERT INTO chat(guid, chat_identifier, display_name, style) VALUES (?,?,?,?)")
        .run("iMessage;-;+15551234567", "+15551234567", "Alice", 45);
    db.prepare("INSERT INTO chat(guid, chat_identifier, display_name, style) VALUES (?,?,?,?)")
        .run("iMessage;+;chat99", "chat99", "Group", 43);
    const m = db.prepare("INSERT INTO message(guid, text, date) VALUES (?,?,?)");
    m.run("m1", "hi", 1000);
    m.run("m2", "there", 2000);
    db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1,1),(1,2)").run();
    return db;
}

function ops(db: Database.Database) {
    const reader = new ChatReader(db, { chat: introspectTable(db, "chat"), message: introspectTable(db, "message") });
    const list = buildReadOperations({ chatReader: reader });
    return (name: string) => list.find(o => o.name === name)!;
}

test("get-chats returns serialized chats (wire-compatible shape)", async () => {
    const by = ops(seed());
    const r = await executeOperation(by("get-chats"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    const chats = (r.data as { chats: { guid: string; style: number; isArchived: boolean }[] }).chats;
    assert.equal(chats.length, 2);
    assert.equal(chats[0]!.guid, "iMessage;+;chat99"); // ROWID DESC
    assert.equal(chats[0]!.style, 43);
    assert.equal(chats[0]!.isArchived, false);
});

test("get-chat-messages returns a chat's messages, newest first, bound by guid", async () => {
    const by = ops(seed());
    const r = await executeOperation(
        by("get-chat-messages"),
        { input: { guid: "iMessage;-;+15551234567" }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    const msgs = (r.data as { messages: { guid: string }[] }).messages;
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0]!.guid, "m2"); // date DESC

    // an unknown chat guid returns no messages (and no error/injection)
    const none = await executeOperation(
        by("get-chat-messages"),
        { input: { guid: "does-not-exist" }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal((none.data as { messages: unknown[] }).messages.length, 0);
});

test("read operations require auth and validate input", async () => {
    const by = ops(seed());
    assert.equal((await executeOperation(by("get-chats"), { input: {} }, ctx, auth)).status, 401);
    // missing required guid
    assert.equal(
        (await executeOperation(by("get-chat-messages"), { input: {}, credential: "pw" }, ctx, auth)).status,
        400
    );
});
