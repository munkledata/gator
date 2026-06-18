import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { introspectTable } from "../src/data/imessage/schema";
import { MessageReader } from "../src/data/imessage/MessageReader";
import { IMessageListener, type CursorStore } from "../src/data/imessage/IMessageListener";
import { INITIAL_CURSOR, type Cursor } from "../src/data/imessage/cursor";
import { EventBus } from "../src/core/bus";
import { createConsoleLogger } from "../src/core/logger";
import type { DomainEvents } from "../src/events";

const silent = createConsoleLogger("test", { level: "fatal" });

class FakeCursorStore implements CursorStore {
    saved: Cursor = INITIAL_CURSOR;
    async load(): Promise<Cursor> {
        return this.saved;
    }
    async save(c: Cursor): Promise<void> {
        this.saved = c;
    }
}

function seed(): Database.Database {
    const db = new Database(":memory:");
    db.exec(
        "CREATE TABLE message(ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, date INTEGER, date_edited INTEGER DEFAULT 0)"
    );
    db.prepare("INSERT INTO message(guid, date) VALUES (?, ?)").run("g1", 1000);
    return db;
}

function listenerFor(db: Database.Database, store: CursorStore) {
    const reader = new MessageReader(db, introspectTable(db, "message"));
    const bus = new EventBus<DomainEvents>();
    const news: unknown[] = [];
    const updates: unknown[] = [];
    bus.on("new-message", m => news.push(m));
    bus.on("updated-message", m => updates.push(m));
    return { listener: new IMessageListener(reader, store, bus, silent), news, updates };
}

test("poll emits new-message for inserts and persists the cursor", async () => {
    const db = seed();
    const store = new FakeCursorStore();
    const { listener, news, updates } = listenerFor(db, store);

    await listener.init();
    const n = await listener.poll();

    assert.equal(n, 1);
    assert.equal(news.length, 1);
    assert.equal(updates.length, 0);
    assert.equal(store.saved.lastRowId, 1);
});

test("poll emits updated-message when an existing row's date_edited advances", async () => {
    const db = seed();
    const store = new FakeCursorStore();
    const { listener, news, updates } = listenerFor(db, store);

    await listener.init();
    await listener.poll(); // consume the initial insert
    db.prepare("UPDATE message SET date_edited = ? WHERE guid = ?").run(9999, "g1");
    const n = await listener.poll();

    assert.equal(n, 1);
    assert.equal(news.length, 1, "no new inserts");
    assert.equal(updates.length, 1, "one update");
});

test("a restart resumes from the persisted cursor (no re-emit)", async () => {
    const db = seed();
    const store = new FakeCursorStore();

    const first = listenerFor(db, store);
    await first.listener.init();
    await first.listener.poll();

    // New listener, same store -> should not re-emit the already-seen row.
    const second = listenerFor(db, store);
    await second.listener.init();
    const n = await second.listener.poll();
    assert.equal(n, 0);
    assert.equal(second.news.length, 0);
});
