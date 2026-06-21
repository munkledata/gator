import type DatabaseType from "better-sqlite3";
import type { ColumnSet } from "./schema";
import { WANTED_MESSAGE_COLUMNS } from "./MessageReader";
import { WANTED_HANDLE_COLUMNS } from "./HandleReader";

/** Chat columns we'd like; projected to what the macOS version actually has. */
export const WANTED_CHAT_COLUMNS: readonly string[] = [
    "ROWID",
    "guid",
    "chat_identifier",
    "service_name",
    "display_name",
    "style",
    "is_archived",
    "group_id",
    "room_name",
    "last_addressed_handle"
];

export interface GetChatsParams {
    limit?: number;
    offset?: number;
}

export interface GetChatMessagesParams {
    chatGuid: string;
    limit?: number;
    offset?: number;
}

/**
 * Read-only chat/message queries over chat.db, the read counterpart used by the
 * migrated `get-chats` / `get-chat-messages` operations. Like {@link MessageReader}:
 * raw prepared SQL, columns projected to what exists, all user input bound as
 * parameters (the `chatGuid` is `@chatGuid`, never interpolated).
 */
export class ChatReader {
    readonly #db: DatabaseType.Database;
    readonly #chat: ColumnSet;
    readonly #message: ColumnSet;
    readonly #handle: ColumnSet | undefined;
    readonly #chatCols: string[];
    readonly #messageCols: string[];
    readonly #handleCols: string[];

    constructor(db: DatabaseType.Database, schema: { chat: ColumnSet; message: ColumnSet; handle?: ColumnSet }) {
        this.#db = db;
        this.#chat = schema.chat;
        this.#message = schema.message;
        this.#handle = schema.handle;
        this.#chatCols = this.#chat.project(WANTED_CHAT_COLUMNS);
        this.#messageCols = this.#message.project(WANTED_MESSAGE_COLUMNS);
        this.#handleCols = this.#handle ? this.#handle.project(WANTED_HANDLE_COLUMNS) : [];
    }

    getChats(params: GetChatsParams = {}): Record<string, unknown>[] {
        // No chat columns => the chat table isn't present (degraded/empty DB) — return [].
        if (this.#chatCols.length === 0) return [];
        const cols = this.#chatCols.map(c => `chat.${c}`).join(", ");
        const sql = `SELECT ${cols} FROM chat ORDER BY chat.ROWID DESC LIMIT @limit OFFSET @offset`;
        return this.#db.prepare(sql).all({ limit: params.limit ?? 1000, offset: params.offset ?? 0 }) as Record<
            string,
            unknown
        >[];
    }

    getChatMessages(params: GetChatMessagesParams): Record<string, unknown>[] {
        if (this.#messageCols.length === 0) return [];
        const cols = this.#messageCols.map(c => `message.${c}`).join(", ");
        const sql =
            `SELECT ${cols} FROM message ` +
            `JOIN chat_message_join cmj ON cmj.message_id = message.ROWID ` +
            `JOIN chat ON chat.ROWID = cmj.chat_id ` +
            `WHERE chat.guid = @chatGuid ORDER BY message.date DESC LIMIT @limit OFFSET @offset`;
        return this.#db
            .prepare(sql)
            .all({ chatGuid: params.chatGuid, limit: params.limit ?? 25, offset: params.offset ?? 0 }) as Record<
            string,
            unknown
        >[];
    }

    /**
     * Batched participant lookup for the `with: ["participants"]` chat-query hydration.
     * One query joins chat_handle_join (chat_id) → handle (ROWID) for all given chats,
     * avoiding the N+1 that a per-chat query would incur. The injected `chat_id`
     * (carried from the chat ROWID) keys the result; handle rows are returned raw for
     * {@link serializeHandle}. The chat_id is selected (not in WANTED_HANDLE_COLUMNS,
     * so it can't clash) purely to group the rows back onto their chat.
     */
    getParticipants(chatRowIds: number[]): Map<number, Record<string, unknown>[]> {
        const out = new Map<number, Record<string, unknown>[]>();
        if (chatRowIds.length === 0 || this.#handleCols.length === 0) return out;
        const placeholders = chatRowIds.map(() => "?").join(",");
        const cols = this.#handleCols.map(c => `handle.${c}`).join(", ");
        const sql =
            `SELECT chj.chat_id AS chat_id, ${cols} FROM handle ` +
            `JOIN chat_handle_join chj ON chj.handle_id = handle.ROWID ` +
            `WHERE chj.chat_id IN (${placeholders}) ORDER BY handle.ROWID ASC`;
        const rows = this.#db.prepare(sql).all(...chatRowIds) as Record<string, unknown>[];
        for (const row of rows) {
            const chatId = Number(row["chat_id"]);
            delete row["chat_id"]; // keep the handle row clean for serializeHandle
            const list = out.get(chatId);
            if (list) list.push(row);
            else out.set(chatId, [row]);
        }
        return out;
    }

    /**
     * Batched newest-message lookup for the `with: ["lastMessage"]` hydration. For each
     * chat we want exactly the most recent message (max `date`). A correlated subquery
     * selects the per-chat max-date message_id, so the join yields one row per chat in a
     * single query (no N+1). The injected `chat_id` keys the result; the message row is
     * returned raw for {@link serializeMessage}.
     */
    getLastMessages(chatRowIds: number[]): Map<number, Record<string, unknown>> {
        const out = new Map<number, Record<string, unknown>>();
        if (chatRowIds.length === 0 || this.#messageCols.length === 0) return out;
        const placeholders = chatRowIds.map(() => "?").join(",");
        const cols = this.#messageCols.map(c => `message.${c}`).join(", ");
        const sql =
            `SELECT cmj.chat_id AS chat_id, ${cols} FROM message ` +
            `JOIN chat_message_join cmj ON cmj.message_id = message.ROWID ` +
            `WHERE cmj.chat_id IN (${placeholders}) ` +
            `AND message.date = (` +
            `SELECT MAX(m2.date) FROM message m2 ` +
            `JOIN chat_message_join cmj2 ON cmj2.message_id = m2.ROWID ` +
            `WHERE cmj2.chat_id = cmj.chat_id` +
            `) ORDER BY message.ROWID DESC`;
        const rows = this.#db.prepare(sql).all(...chatRowIds) as Record<string, unknown>[];
        for (const row of rows) {
            const chatId = Number(row["chat_id"]);
            delete row["chat_id"]; // keep the message row clean for serializeMessage
            // Ties on date (rare): the ROWID-DESC order means the first row seen is the
            // newest by ROWID; keep it and ignore later duplicates for the same chat.
            if (!out.has(chatId)) out.set(chatId, row);
        }
        return out;
    }

    /**
     * Batched chat-per-message lookup for the `with: ["chats"]` incremental-sync
     * hydration. One query joins chat_message_join (message_id) → chat for all given
     * message ROWIDs, avoiding the N+1 a per-message query would incur. The selected
     * `cmj.message_id AS __mrowid` (a helper key that can't clash with chat columns)
     * groups the rows back onto their message; it's deleted before grouping so each raw
     * chat row stays clean for {@link serializeChat}. Keyed by message ROWID (the page
     * carries each message's ROWID). Version-safe: empty input or a degraded DB (no chat
     * columns) returns an empty Map. A message can belong to multiple chats, so the value
     * is a list (the app routes on `chats[0].guid`).
     */
    getChatsForMessages(messageRowIds: number[]): Map<number, Record<string, unknown>[]> {
        const out = new Map<number, Record<string, unknown>[]>();
        if (messageRowIds.length === 0 || this.#chatCols.length === 0) return out;
        const placeholders = messageRowIds.map(() => "?").join(",");
        const cols = this.#chatCols.map(c => `chat.${c}`).join(", ");
        const sql =
            `SELECT cmj.message_id AS __mrowid, ${cols} FROM chat ` +
            `JOIN chat_message_join cmj ON cmj.chat_id = chat.ROWID ` +
            `WHERE cmj.message_id IN (${placeholders}) ORDER BY chat.ROWID ASC`;
        const rows = this.#db.prepare(sql).all(...messageRowIds) as Record<string, unknown>[];
        for (const row of rows) {
            const mRowId = Number(row["__mrowid"]);
            delete row["__mrowid"]; // keep the chat row clean for serializeChat
            const list = out.get(mRowId);
            if (list) list.push(row);
            else out.set(mRowId, [row]);
        }
        return out;
    }
}
