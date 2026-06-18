import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { webhooksTable } from "../data/config-db/tables";
import type { CreateWebhook, Webhook, WebhookStore } from "./Webhook";

/** Production webhook store (better-sqlite3 via Drizzle); typecheck-verified. */
export class DrizzleWebhookStore implements WebhookStore {
    readonly #db: BetterSQLite3Database;

    constructor(dbPath: string) {
        const sqlite = new Database(dbPath);
        sqlite.exec(
            `CREATE TABLE IF NOT EXISTS webhooks (
                 id TEXT PRIMARY KEY, url TEXT NOT NULL, events TEXT NOT NULL, secret TEXT, created_at INTEGER NOT NULL
             );`
        );
        this.#db = drizzle(sqlite);
    }

    async create(input: CreateWebhook): Promise<Webhook> {
        const webhook: Webhook = {
            id: randomUUID(),
            url: input.url,
            events: input.events.length > 0 ? input.events : ["*"],
            createdAt: Date.now(),
            ...(input.secret != null ? { secret: input.secret } : {})
        };
        this.#db
            .insert(webhooksTable)
            .values({
                id: webhook.id,
                url: webhook.url,
                events: JSON.stringify(webhook.events),
                secret: webhook.secret ?? null,
                createdAt: webhook.createdAt
            })
            .run();
        return webhook;
    }

    async list(): Promise<Webhook[]> {
        return this.#db.select().from(webhooksTable).all().map(rowToWebhook);
    }

    async delete(id: string): Promise<boolean> {
        return this.#db.delete(webhooksTable).where(eq(webhooksTable.id, id)).run().changes > 0;
    }
}

function rowToWebhook(row: typeof webhooksTable.$inferSelect): Webhook {
    let events: string[];
    try {
        const parsed = JSON.parse(row.events);
        events = Array.isArray(parsed) ? parsed.map(String) : ["*"];
    } catch {
        events = ["*"];
    }
    return {
        id: row.id,
        url: row.url,
        events,
        createdAt: row.createdAt,
        ...(row.secret != null ? { secret: row.secret } : {})
    };
}
