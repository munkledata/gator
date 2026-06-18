import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openReadOnlyChatDb } from "../src/data/imessage/connection";

function tmpDb(): string {
    return path.join(os.tmpdir(), `bbd-conn-${process.pid}-${Date.now()}.db`);
}

test("openReadOnlyChatDb reads existing data but blocks writes", () => {
    const file = tmpDb();
    const w = new Database(file);
    w.exec("CREATE TABLE message(ROWID INTEGER PRIMARY KEY, guid TEXT)");
    w.prepare("INSERT INTO message(guid) VALUES (?)").run("g1");
    w.close();

    try {
        const ro = openReadOnlyChatDb(file);
        const row = ro.prepare("SELECT COUNT(*) AS n FROM message").get() as { n: number };
        assert.equal(row.n, 1);
        assert.throws(() => ro.prepare("INSERT INTO message(guid) VALUES ('x')").run(), /readonly/i);
        ro.close();
    } finally {
        fs.rmSync(file, { force: true });
    }
});

test("fileMustExist: opening a missing DB throws (never creates Apple's DB)", () => {
    assert.throws(() => openReadOnlyChatDb(path.join(os.tmpdir(), `bbd-missing-${Date.now()}.db`)));
});
