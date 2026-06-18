import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * The writable config database (config.db) schema, in Drizzle.
 *
 * This replaces the legacy TypeORM `ServerRepository`. It is a *separate* connection
 * from the read-only Apple chat.db. Drizzle gives typed, code-first migrations for
 * the one DB the server actually owns and mutates.
 */

/** Whole-config blob (a single row, key="config", value=JSON). */
export const configTable = sqliteTable("config", {
    key: text("key").primaryKey(),
    value: text("value").notNull()
});

/**
 * Registered client devices. The `provider` discriminator + JSON `registration`
 * model the pluggable push contract: UnifiedPush stores `{ endpoint }`, FCM stores
 * `{ token }`, Web Push stores `{ subscription }`. The legacy table only held FCM
 * tokens.
 */
export const devicesTable = sqliteTable("devices", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    provider: text("provider", { enum: ["unifiedpush", "fcm", "webpush"] }).notNull(),
    /** Provider-specific registration, JSON-encoded. */
    registration: text("registration").notNull(),
    createdAt: integer("created_at").notNull(),
    lastActiveAt: integer("last_active_at")
});

/** Registered webhooks (URL + event filter + optional signing secret). */
export const webhooksTable = sqliteTable("webhooks", {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    /** JSON array of event types, or ["*"]. */
    events: text("events").notNull(),
    secret: text("secret"),
    createdAt: integer("created_at").notNull()
});

/** Scheduled (future-dated) messages — must survive restarts, hence persisted here. */
export const scheduledMessagesTable = sqliteTable("scheduled_messages", {
    id: text("id").primaryKey(),
    chatGuid: text("chat_guid").notNull(),
    text: text("text").notNull(),
    scheduledFor: integer("scheduled_for").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    error: text("error")
});
