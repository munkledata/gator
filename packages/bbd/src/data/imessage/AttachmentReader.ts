import type DatabaseType from "better-sqlite3";
import type { ColumnSet } from "./schema";

export const WANTED_ATTACHMENT_COLUMNS: readonly string[] = [
    "ROWID",
    "guid",
    "original_guid",
    "filename",
    "uti",
    "mime_type",
    "transfer_name",
    "total_bytes",
    "is_sticker",
    "hide_attachment"
];

/** Read-only queries over the chat.db `attachment` table. */
export class AttachmentReader {
    readonly #db: DatabaseType.Database;
    readonly #cols: string[];

    constructor(db: DatabaseType.Database, attachment: ColumnSet) {
        this.#db = db;
        this.#cols = attachment.project(WANTED_ATTACHMENT_COLUMNS);
    }

    /** Attachments for a given message GUID (metadata only — bytes are streamed separately). */
    getMessageAttachments(messageGuid: string): Record<string, unknown>[] {
        const cols = this.#cols.map(c => `attachment.${c}`).join(", ");
        const sql =
            `SELECT ${cols} FROM attachment ` +
            `JOIN message_attachment_join maj ON maj.attachment_id = attachment.ROWID ` +
            `JOIN message ON message.ROWID = maj.message_id ` +
            `WHERE message.guid = @messageGuid`;
        return this.#db.prepare(sql).all({ messageGuid }) as Record<string, unknown>[];
    }

    /**
     * Batched attachment lookup for the `with: ["attachments"]` chat-messages hydration.
     * One query joins message_attachment_join (attachment_id) → attachment for all given
     * message GUIDs, avoiding the N+1 a per-message query would incur. The selected
     * `message.guid AS __mguid` (a helper key that can't clash with attachment columns)
     * groups the rows back onto their message; it's deleted before grouping so each raw
     * attachment row stays clean for {@link serializeAttachment}. Version-safe: an empty
     * input or a degraded DB (no attachment columns) returns an empty Map.
     */
    getMessageAttachmentsBatch(messageGuids: string[]): Map<string, Record<string, unknown>[]> {
        const out = new Map<string, Record<string, unknown>[]>();
        if (messageGuids.length === 0 || this.#cols.length === 0) return out;
        const placeholders = messageGuids.map(() => "?").join(",");
        const cols = this.#cols.map(c => `attachment.${c}`).join(", ");
        const sql =
            `SELECT message.guid AS __mguid, ${cols} FROM attachment ` +
            `JOIN message_attachment_join maj ON maj.attachment_id = attachment.ROWID ` +
            `JOIN message ON message.ROWID = maj.message_id ` +
            `WHERE message.guid IN (${placeholders}) ORDER BY attachment.ROWID ASC`;
        const rows = this.#db.prepare(sql).all(...messageGuids) as Record<string, unknown>[];
        for (const row of rows) {
            const mguid = String(row["__mguid"]);
            delete row["__mguid"]; // keep the attachment row clean for serializeAttachment
            const list = out.get(mguid);
            if (list) list.push(row);
            else out.set(mguid, [row]);
        }
        return out;
    }
}
