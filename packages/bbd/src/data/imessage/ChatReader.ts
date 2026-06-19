import type DatabaseType from "better-sqlite3";
import type { ColumnSet } from "./schema";
import { WANTED_MESSAGE_COLUMNS } from "./MessageReader";

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
    readonly #chatCols: string[];
    readonly #messageCols: string[];

    constructor(db: DatabaseType.Database, schema: { chat: ColumnSet; message: ColumnSet }) {
        this.#db = db;
        this.#chat = schema.chat;
        this.#message = schema.message;
        this.#chatCols = this.#chat.project(WANTED_CHAT_COLUMNS);
        this.#messageCols = this.#message.project(WANTED_MESSAGE_COLUMNS);
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
}
