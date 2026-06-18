import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { introspectTable } from "../src/data/imessage/schema";
import { MessageReader } from "../src/data/imessage/MessageReader";
import { INITIAL_CURSOR } from "../src/data/imessage/cursor";

function seed(): Database.Database {
    const db = new Database(":memory:");
    db.exec(
        `CREATE TABLE message(
            ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
            guid TEXT, text TEXT, date INTEGER,
            date_edited INTEGER DEFAULT 0, is_from_me INTEGER DEFAULT 0
        )`
    );
    const ins = db.prepare("INSERT INTO message(guid, text, date) VALUES (?, ?, ?)");
    ins.run("g1", "hello", 1000);
    ins.run("g2", "world", 2000);
    return db;
}

test("readSince from the initial cursor returns all rows, ordered, projecting existing columns", () => {
    const db = seed();
    const reader = new MessageReader(db, introspectTable(db, "message"));
    const { rows, cursor } = reader.readSince(INITIAL_CURSOR);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!["guid"], "g1");
    assert.equal(cursor.lastRowId, 2);
    // attributedBody is wanted but absent in this schema -> not selected, no throw.
    assert.equal("attributedBody" in rows[0]!, false);
});

test("readSince after advancing returns only new inserts", () => {
    const db = seed();
    const reader = new MessageReader(db, introspectTable(db, "message"));
    const first = reader.readSince(INITIAL_CURSOR);
    db.prepare("INSERT INTO message(guid, text, date) VALUES (?, ?, ?)").run("g3", "new", 3000);
    const second = reader.readSince(first.cursor);
    assert.equal(second.rows.length, 1);
    assert.equal(second.rows[0]!["guid"], "g3");
});

test("an edit to an existing row is re-detected via date_edited (no ROWID change)", () => {
    const db = seed();
    const reader = new MessageReader(db, introspectTable(db, "message"));
    const first = reader.readSince(INITIAL_CURSOR);
    db.prepare("UPDATE message SET date_edited = ? WHERE guid = ?").run(5000, "g1");
    const second = reader.readSince(first.cursor);
    assert.equal(second.rows.length, 1);
    assert.equal(second.rows[0]!["guid"], "g1");
});

test("byGuid hydrates specific messages", () => {
    const db = seed();
    const reader = new MessageReader(db, introspectTable(db, "message"));
    const rows = reader.byGuid(["g2"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!["text"], "world");
    assert.deepEqual(reader.byGuid([]), []);
});
