import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { introspectTable, introspectSchema, ColumnSet, tableExists } from "../src/data/imessage/schema";

const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../macos/database/samples");

function messageSchemaFor(version: string): Database.Database {
    const sql = fs.readFileSync(path.join(SAMPLES, version, "message.sql"), "utf8");
    const db = new Database(":memory:");
    db.exec(sql);
    return db;
}

test("ColumnSet.project keeps only existing columns", () => {
    const cols = new ColumnSet(["a", "b", "c"]);
    assert.deepEqual(cols.project(["a", "z", "c"]), ["a", "c"]);
    assert.equal(cols.has("b"), true);
    assert.equal(cols.has("z"), false);
});

test("introspection reflects real macOS schema drift (the resilience thesis)", () => {
    // Ventura (macOS 13) has edit/unsend + thread columns.
    const ventura = introspectSchema(messageSchemaFor("ventura"));
    assert.equal(ventura.hasEditColumns, true);
    assert.equal(ventura.hasThreadColumns, true);
    assert.equal(ventura.hasAttributedBody, true);

    // El Capitan (macOS 10.11) predates edits, threads, and notify-anyways.
    const elCapitan = introspectSchema(messageSchemaFor("el-capitan"));
    assert.equal(elCapitan.hasEditColumns, false);
    assert.equal(elCapitan.hasThreadColumns, false);
    assert.equal(elCapitan.hasNotifyColumn, false);

    // Sequoia (macOS 15) still has the modern columns.
    assert.equal(introspectSchema(messageSchemaFor("sequoia")).hasEditColumns, true);
});

test("missing table introspects to an empty ColumnSet, not a throw", () => {
    const db = new Database(":memory:");
    assert.equal(tableExists(db, "message"), false);
    assert.equal(introspectTable(db, "message").size, 0);
});

test("unsafe table identifiers are rejected", () => {
    const db = new Database(":memory:");
    assert.throws(() => introspectTable(db, "message; DROP TABLE x"), /unsafe SQL identifier/);
});

test("live chat.db (if accessible) introspects with the expected core columns", () => {
    const live = path.join(os.homedir(), "Library", "Messages", "chat.db");
    if (!fs.existsSync(live)) return; // skip in CI / no FDA
    let db: Database.Database;
    try {
        db = new Database(live, { readonly: true, fileMustExist: true });
    } catch {
        return; // no full-disk-access; not a failure of this code
    }
    try {
        const message = introspectTable(db, "message");
        for (const core of ["ROWID", "guid", "text", "date", "is_from_me"]) {
            assert.equal(message.has(core), true, `live chat.db missing core column ${core}`);
        }
    } finally {
        db.close();
    }
});
