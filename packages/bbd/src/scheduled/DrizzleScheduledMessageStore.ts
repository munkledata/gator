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
