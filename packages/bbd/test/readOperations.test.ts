import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ChatReader } from "../src/data/imessage/ChatReader";
import { HandleReader } from "../src/data/imessage/HandleReader";
import { AttachmentReader } from "../src/data/imessage/AttachmentReader";
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
        CREATE TABLE chat_handle_join(chat_id INTEGER, handle_id INTEGER);
        CREATE TABLE handle(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, country TEXT, service TEXT, uncanonicalized_id TEXT);
        CREATE TABLE attachment(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, mime_type TEXT, transfer_name TEXT, total_bytes INTEGER, is_sticker INTEGER DEFAULT 0, hide_attachment INTEGER DEFAULT 0);
        CREATE TABLE message_attachment_join(message_id INTEGER, attachment_id INTEGER);
    `);
    db.prepare("INSERT INTO handle(id, country, service) VALUES (?,?,?)").run("+15551234567", "us", "iMessage");
    db.prepare("INSERT INTO attachment(guid, mime_type, transfer_name, total_bytes) VALUES (?,?,?,?)")
        .run("att-1", "image/png", "pic.png", 4096);
    db.prepare("INSERT INTO message_attachment_join(message_id, attachment_id) VALUES (1,1)").run();
    db.prepare("INSERT INTO chat(guid, chat_identifier, display_name, style) VALUES (?,?,?,?)")
        .run("iMessage;-;+15551234567", "+15551234567", "Alice", 45);
    db.prepare("INSERT INTO chat(guid, chat_identifier, display_name, style) VALUES (?,?,?,?)")
        .run("iMessage;+;chat99", "chat99", "Group", 43);
    const m = db.prepare("INSERT INTO message(guid, text, date) VALUES (?,?,?)");
    m.run("m1", "hi", 1000);
    m.run("m2", "there", 2000);
    db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1,1),(1,2)").run();
    // chat 1 (Alice, ROWID 1) has handle 1 as a participant.
    db.prepare("INSERT INTO chat_handle_join(chat_id, handle_id) VALUES (1,1)").run();
    return db;
}

/**
 * A 2-chat fixture with disjoint participants and messages, to prove the batched
 * with-hydration keys each chat by its own ROWID (no cross-contamination).
 */
function seedTwoChats(): Database.Database {
    const db = new Database(":memory:");
    db.exec(`
        CREATE TABLE chat(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, chat_identifier TEXT,
            display_name TEXT, style INTEGER, is_archived INTEGER DEFAULT 0, group_id TEXT);
        CREATE TABLE message(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, text TEXT, date INTEGER,
            is_from_me INTEGER DEFAULT 0, associated_message_type INTEGER DEFAULT 0);
        CREATE TABLE chat_message_join(chat_id INTEGER, message_id INTEGER);
        CREATE TABLE chat_handle_join(chat_id INTEGER, handle_id INTEGER);
        CREATE TABLE handle(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, country TEXT, service TEXT, uncanonicalized_id TEXT);
        CREATE TABLE attachment(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, mime_type TEXT, transfer_name TEXT, total_bytes INTEGER, is_sticker INTEGER DEFAULT 0, hide_attachment INTEGER DEFAULT 0);
        CREATE TABLE message_attachment_join(message_id INTEGER, attachment_id INTEGER);
    `);
    const h = db.prepare("INSERT INTO handle(id, country, service) VALUES (?,?,?)");
    h.run("+1111", "us", "iMessage"); // handle 1
    h.run("+2222", "us", "iMessage"); // handle 2
    const c = db.prepare("INSERT INTO chat(guid, chat_identifier, display_name, style) VALUES (?,?,?,?)");
    c.run("iMessage;-;+1111", "+1111", "ChatA", 45); // chat 1
    c.run("iMessage;-;+2222", "+2222", "ChatB", 45); // chat 2
    const m = db.prepare("INSERT INTO message(guid, text, date) VALUES (?,?,?)");
    m.run("a-old", "a old", 1000); // msg 1 → chat 1
    m.run("a-new", "a new", 3000); // msg 2 → chat 1 (newest for A)
    m.run("b-old", "b old", 2000); // msg 3 → chat 2
    m.run("b-new", "b new", 4000); // msg 4 → chat 2 (newest for B)
    db.prepare("INSERT INTO chat_message_join(chat_id, message_id) VALUES (1,1),(1,2),(2,3),(2,4)").run();
    db.prepare("INSERT INTO chat_handle_join(chat_id, handle_id) VALUES (1,1),(2,2)").run();
    // Disjoint attachments to prove the batched attachment hydration keys each message by
    // its own guid (no cross-contamination): att-a → msg "a-new", att-b → msg "b-new".
    const a = db.prepare("INSERT INTO attachment(guid, mime_type, transfer_name, total_bytes) VALUES (?,?,?,?)");
    a.run("att-a", "image/jpeg", "a.jpg", 11); // attachment 1
    a.run("att-b", "image/gif", "b.gif", 22); // attachment 2
    // msg "a-new" is ROWID 2; msg "b-new" is ROWID 4.
    db.prepare("INSERT INTO message_attachment_join(message_id, attachment_id) VALUES (2,1),(4,2)").run();
    return db;
}

function ops(db: Database.Database) {
    const chatReader = new ChatReader(db, {
        chat: introspectTable(db, "chat"),
        message: introspectTable(db, "message"),
        handle: introspectTable(db, "handle")
    });
    const handleReader = new HandleReader(db, introspectTable(db, "handle"));
    const attachmentReader = new AttachmentReader(db, introspectTable(db, "attachment"));
    const list = buildReadOperations({ chatReader, handleReader, attachmentReader });
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

test("get-chats WITHOUT `with` omits participants/lastMessage (byte-identical to before)", async () => {
    const by = ops(seed());
    const r = await executeOperation(by("get-chats"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    const chats = (r.data as { chats: Record<string, unknown>[] }).chats;
    assert.equal(chats.length, 2);
    for (const c of chats) {
        assert.equal("participants" in c, false);
        assert.equal("lastMessage" in c, false);
        // no internal ROWID leaks onto the wire
        assert.equal("ROWID" in c, false);
    }
    // an empty `with` array behaves exactly like absent
    const r2 = await executeOperation(by("get-chats"), { input: { with: [] }, credential: "pw" }, ctx, auth);
    const chats2 = (r2.data as { chats: Record<string, unknown>[] }).chats;
    for (const c of chats2) assert.equal("participants" in c, false);
});

test("get-chats WITH [participants] hydrates each chat's participant handles", async () => {
    const by = ops(seed());
    const r = await executeOperation(
        by("get-chats"),
        { input: { with: ["participants"] }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    type Row = { guid: string; participants: { address: string }[]; lastMessage?: unknown };
    const chats = (r.data as { chats: Row[] }).chats;
    const alice = chats.find(c => c.guid === "iMessage;-;+15551234567")!;
    const group = chats.find(c => c.guid === "iMessage;+;chat99")!;
    assert.deepEqual(
        alice.participants.map(p => p.address),
        ["+15551234567"]
    );
    // chat with no participants gets an empty array (still no lastMessage key)
    assert.deepEqual(group.participants, []);
    assert.equal("lastMessage" in group, false);
});

test("get-chats WITH [lastMessage] hydrates each chat's newest message", async () => {
    const by = ops(seed());
    const r = await executeOperation(
        by("get-chats"),
        { input: { with: ["lastMessage"] }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    type Row = { guid: string; lastMessage: { guid: string } | null; participants?: unknown };
    const chats = (r.data as { chats: Row[] }).chats;
    const alice = chats.find(c => c.guid === "iMessage;-;+15551234567")!;
    const group = chats.find(c => c.guid === "iMessage;+;chat99")!;
    assert.equal(alice.lastMessage!.guid, "m2"); // date 2000 > 1000 → newest
    assert.equal(group.lastMessage, null); // no messages → explicit null
    assert.equal("participants" in alice, false);
});

test("get-chats batching: 2 chats each get their own participants + last message (no cross-contamination)", async () => {
    const by = ops(seedTwoChats());
    const r = await executeOperation(
        by("get-chats"),
        { input: { with: ["participants", "lastMessage"] }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    type Row = { guid: string; participants: { address: string }[]; lastMessage: { guid: string } | null };
    const chats = (r.data as { chats: Row[] }).chats;
    const a = chats.find(c => c.guid === "iMessage;-;+1111")!;
    const b = chats.find(c => c.guid === "iMessage;-;+2222")!;

    assert.deepEqual(
        a.participants.map(p => p.address),
        ["+1111"]
    );
    assert.equal(a.lastMessage!.guid, "a-new"); // date 3000, not 4000 (chat B's)

    assert.deepEqual(
        b.participants.map(p => p.address),
        ["+2222"]
    );
    assert.equal(b.lastMessage!.guid, "b-new"); // date 4000, not 3000 (chat A's)
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

test("get-chat-messages WITHOUT `with` omits attachments (byte-identical to before)", async () => {
    const by = ops(seed());
    const r = await executeOperation(
        by("get-chat-messages"),
        { input: { guid: "iMessage;-;+15551234567" }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    const msgs = (r.data as { messages: Record<string, unknown>[] }).messages;
    assert.equal(msgs.length, 2);
    for (const m of msgs) assert.equal("attachments" in m, false);
});

test("get-chat-messages WITH attachments nests each message's own attachments", async () => {
    const by = ops(seed());
    // The app passes `with` as a comma-string query param.
    const r = await executeOperation(
        by("get-chat-messages"),
        {
            input: {
                guid: "iMessage;-;+15551234567",
                with: "chats,chats.participants,attachments,attributedBody,messageSummaryInfo,payloadData"
            },
            credential: "pw"
        },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    type Row = { guid: string; attachments: { guid: string; mimeType: string; totalBytes: number }[] };
    const msgs = (r.data as { messages: Row[] }).messages;
    const m1 = msgs.find(m => m.guid === "m1")!;
    // m1 carries its own attachment (att-1), not m2's (none).
    assert.equal(m1.attachments.length, 1);
    assert.equal(m1.attachments[0]!.guid, "att-1");
    assert.equal(m1.attachments[0]!.mimeType, "image/png");
    assert.equal(m1.attachments[0]!.totalBytes, 4096);
});

test("get-chat-messages WITH attachments gives a message with none an empty array (requested but empty)", async () => {
    const by = ops(seed());
    // `attachment` (singular) is tolerated too.
    const r = await executeOperation(
        by("get-chat-messages"),
        { input: { guid: "iMessage;-;+15551234567", with: ["attachment"] }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    type Row = { guid: string; attachments: unknown[] };
    const msgs = (r.data as { messages: Row[] }).messages;
    const m2 = msgs.find(m => m.guid === "m2")!;
    // present (requested) but empty — `[]`, not an omitted key.
    assert.equal("attachments" in m2, true);
    assert.deepEqual(m2.attachments, []);
});

test("get-chat-messages attachment batching: each message gets only its own (no cross-contamination)", async () => {
    const by = ops(seedTwoChats());
    // ChatB has two messages (b-old, b-new); only b-new has an attachment (att-b).
    const r = await executeOperation(
        by("get-chat-messages"),
        { input: { guid: "iMessage;-;+2222", with: "attachments" }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    type Row = { guid: string; attachments: { guid: string }[] };
    const msgs = (r.data as { messages: Row[] }).messages;
    const bNew = msgs.find(m => m.guid === "b-new")!;
    const bOld = msgs.find(m => m.guid === "b-old")!;
    // b-new gets att-b only (not chat A's att-a); b-old gets [].
    assert.deepEqual(
        bNew.attachments.map(a => a.guid),
        ["att-b"]
    );
    assert.deepEqual(bOld.attachments, []);
});

test("get-handles returns serialized handles", async () => {
    const by = ops(seed());
    const r = await executeOperation(by("get-handles"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    const handles = (r.data as { handles: { address: string; service: string }[] }).handles;
    assert.equal(handles.length, 1);
    assert.equal(handles[0]!.address, "+15551234567");
    assert.equal(handles[0]!.service, "iMessage");
});

test("get-message-attachments returns a message's attachment metadata", async () => {
    const by = ops(seed());
    const r = await executeOperation(
        by("get-message-attachments"),
        { input: { guid: "m1" }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    const atts = (r.data as { attachments: { guid: string; mimeType: string; totalBytes: number }[] }).attachments;
    assert.equal(atts.length, 1);
    assert.equal(atts[0]!.guid, "att-1");
    assert.equal(atts[0]!.mimeType, "image/png");
    assert.equal(atts[0]!.totalBytes, 4096);
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
