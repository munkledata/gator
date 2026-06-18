import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { ChatReader } from "../../data/imessage/ChatReader";
import { serializeChat } from "../../serialize/chatSerializer";
import { serializeMessage } from "../../serialize/messageSerializer";

const Pagination = {
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional()
};

const GetChatsInput = z.object({ ...Pagination });
const GetChatMessagesInput = z.object({ guid: z.string().min(1), ...Pagination });

export interface ReadOperationDeps {
    chatReader: ChatReader;
}

/**
 * Migrated chat/message read operations — the legacy `get-chats` and
 * `get-chat-messages` socket/REST handlers, now defined once on the Phase 4 layer
 * and served on both transports. Rows come from the read-only chat.db reader and go
 * through the wire-compatible serializers. Adding the rest of the ~37 legacy
 * handlers is the same shape: read -> serialize -> defineOperation.
 */
export function buildReadOperations(deps: ReadOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "get-chats",
            method: "POST",
            path: "/api/v1/chat/query",
            auth: true,
            input: GetChatsInput,
            summary: "List chats",
            handler: (_ctx, input) => ({
                chats: deps.chatReader.getChats({ limit: input.limit, offset: input.offset }).map(serializeChat)
            })
        }),
        defineOperation({
            name: "get-chat-messages",
            method: "GET",
            path: "/api/v1/chat/:guid/message",
            auth: true,
            input: GetChatMessagesInput,
            summary: "Messages in a chat (newest first)",
            handler: (_ctx, input) => ({
                messages: deps.chatReader
                    .getChatMessages({ chatGuid: input.guid, limit: input.limit, offset: input.offset })
                    .map(serializeMessage)
            })
        })
    ];
}
