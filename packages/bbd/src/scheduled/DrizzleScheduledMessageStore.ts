import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, and, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { scheduledMessagesTable } from "../data/config-db/tables";
import type { CreateScheduledMessage, ScheduledMessage, ScheduledMessageStore } from "./ScheduledMessage";

/**
 * Production scheduled-message store (better-sqlite3 via Drizzle). Typecheck-verified
 * here; the unit tests use {@link InMemoryScheduledMessageStore}. Shares the config DB
 * connection in main.ts.
 */
export class DrizzleScheduledMessageStore implements ScheduledMessageStore {
    readonly #db: BetterSQLite3Database;

    constructor(dbPath: string) {
        const sqlite = new Database(dbPath);
        sqlite.exec(
            `CREATE TABLE IF NOT EXISTS scheduled_messages (
                 id TEXT PRIMARY KEY, chat_guid TEXT NOT NULL, text TEXT NOT NULL,
                 scheduled_for INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, error TEXT
             );`
        );
        this.#db = drizzle(sqlite);
    }

    async create(input: CreateScheduledMessage): Promise<ScheduledMessage> {
        const msg: ScheduledMessage = {
            id: randomUUID(),
            chatGuid: input.chatGuid,
            text: input.text,
            scheduledFor: input.scheduledFor,
            status: "pending",
            createdAt: Date.now()
        };
        this.#db.insert(scheduledMessagesTable).values({ ...msg, error: null }).run();
        return msg;
    }

    async list(): Promise<ScheduledMessage[]> {
        return this.#db.select().from(scheduledMessagesTable).all().map(rowToMessage);
    }

    async get(id: string): Promise<ScheduledMessage | undefined> {
        const row = this.#db.select().from(scheduledMessagesTable).where(eq(scheduledMessagesTable.id, id)).get();
        return row ? rowToMessage(row) : undefined;
    }

    async delete(id: string): Promise<boolean> {
        const res = this.#db.delete(scheduledMessagesTable).where(eq(scheduledMessagesTable.id, id)).run();
        return res.changes > 0;
    }

    async due(nowMs: number): Promise<ScheduledMessage[]> {
        return this.#db
            .select()
            .from(scheduledMessagesTable)
            .where(and(eq(scheduledMessagesTable.status, "pending"), lte(scheduledMessagesTable.scheduledFor, nowMs)))
            .all()
            .map(rowToMessage);
    }

    async claim(id: string): Promise<boolean> {
        // Atomic compare-and-set: UPDATE ... SET status='sending' WHERE id=? AND status='pending'.
        // SQLite serializes the statement, so exactly one of two overlapping ticks gets
        // changes===1; the loser sees 0 and skips, which is the real lock against double-send
        // (audit F11). A component-level guard alone can't prevent two ticks racing the same row.
        const res = this.#db
            .update(scheduledMessagesTable)
            .set({ status: "sending" })
            .where(and(eq(scheduledMessagesTable.id, id), eq(scheduledMessagesTable.status, "pending")))
            .run();
        return res.changes === 1;
    }

    async resetStuck(): Promise<number> {
        // Recover rows orphaned in `sending` by a crash mid-send: put them back to `pending`
        // so the next tick re-claims them. Run once at startup.
        const res = this.#db
            .update(scheduledMessagesTable)
            .set({ status: "pending" })
            .where(eq(scheduledMessagesTable.status, "sending"))
            .run();
        return res.changes;
    }

    async markSent(id: string): Promise<void> {
        this.#db.update(scheduledMessagesTable).set({ status: "sent" }).where(eq(scheduledMessagesTable.id, id)).run();
    }

    async markFailed(id: string, error: string): Promise<void> {
        this.#db
            .update(scheduledMessagesTable)
            .set({ status: "failed", error })
            .where(eq(scheduledMessagesTable.id, id))
            .run();
    }
}

function rowToMessage(row: typeof scheduledMessagesTable.$inferSelect): ScheduledMessage {
    return {
        id: row.id,
        chatGuid: row.chatGuid,
        text: row.text,
        scheduledFor: row.scheduledFor,
        status: row.status,
        createdAt: row.createdAt,
        ...(row.error != null ? { error: row.error } : {})
    };
}
