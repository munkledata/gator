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
}
