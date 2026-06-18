import type DatabaseType from "better-sqlite3";
import type { ColumnSet } from "./schema";
import { type Cursor, buildDeltaQuery, advanceCursor } from "./cursor";

/**
 * The full set of message columns we'd like. {@link ColumnSet.project} trims it to
 * what the current macOS version actually has, so the SELECT never references a
 * missing column (the legacy entity mapping would throw on a dropped column).
 */
export const WANTED_MESSAGE_COLUMNS: readonly string[] = [
    "ROWID",
    "guid",
    "text",
    "subject",
    "attributedBody",
    "handle_id",
    "service",
    "account",
    "error",
    "date",
    "date_read",
    "date_delivered",
    "date_edited",
    "date_retracted",
    "is_from_me",
    "is_read",
    "is_sent",
    "is_delivered",
    "is_audio_message",
    "item_type",
    "group_title",
    "group_action_type",
    "associated_message_guid",
    "associated_message_type",
    "balloon_bundle_id",
    "payload_data",
    "expressive_send_style_id",
    "thread_originator_guid",
    "thread_originator_part",
    "reply_to_guid",
    "did_notify_recipient",
    "part_count"
];

export interface ReadResult {
    rows: Record<string, unknown>[];
    cursor: Cursor;
}

/**
 * Reads messages from a read-only chat.db using schema-projected columns and the
 * durable cursor. No ORM, no time-window lookback — raw prepared SQL over exactly
 * the columns that exist.
 */
export class MessageReader {
    readonly #db: DatabaseType.Database;
    readonly #columns: string[];
    readonly #message: ColumnSet;

    constructor(db: DatabaseType.Database, message: ColumnSet) {
        this.#db = db;
        this.#message = message;
        this.#columns = message.project(WANTED_MESSAGE_COLUMNS);
    }

    #select(): string {
        return this.#columns.map(c => `message.${c}`).join(", ");
    }

    /** Read messages new or updated since the cursor; returns rows + advanced cursor. */
    readSince(cursor: Cursor, limit = 1000): ReadResult {
        const { where, params } = buildDeltaQuery(cursor, this.#message);
        const sql = `SELECT ${this.#select()} FROM message WHERE ${where} ORDER BY message.ROWID ASC LIMIT @limit`;
        const rows = this.#db.prepare(sql).all({ ...params, limit }) as Record<string, unknown>[];
        return { rows, cursor: advanceCursor(cursor, rows) };
    }

    /** Hydrate specific messages by GUID — the fast path when the dylib pushes a GUID. */
    byGuid(guids: readonly string[]): Record<string, unknown>[] {
        if (guids.length === 0) return [];
        const placeholders = guids.map(() => "?").join(",");
        const sql = `SELECT ${this.#select()} FROM message WHERE message.guid IN (${placeholders})`;
        return this.#db.prepare(sql).all(...guids) as Record<string, unknown>[];
    }
}
