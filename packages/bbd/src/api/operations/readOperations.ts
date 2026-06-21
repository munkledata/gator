import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { ChatReader } from "../../data/imessage/ChatReader";
import type { HandleReader } from "../../data/imessage/HandleReader";
import type { AttachmentReader } from "../../data/imessage/AttachmentReader";
import { serializeChat, type ChatExtra } from "../../serialize/chatSerializer";
import { serializeMessage, type MessageExtra } from "../../serialize/messageSerializer";
import { serializeHandle } from "../../serialize/handleSerializer";
import { serializeAttachment } from "../../serialize/attachmentSerializer";

const Pagination = {
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional()
};

// `with` selects optional hydration the app requests for inbox rows, e.g.
// ["participants", "lastMessage"]. Accepted leniently — unknown entries are ignored
// by the handler, so it's forward-compatible with future hydration kinds.
const GetChatsInput = z.object({ with: z.array(z.string()).optional(), ...Pagination });
// `with` here is the app's comma-string query param (e.g.
// "chats,chats.participants,attachments,attributedBody,..."); an array is also tolerated.
// Normalized to a Set by {@link wantSet}; only the `attachments` token is acted on, the
// rest are ignored, so it's forward-compatible with future hydration kinds.
const GetChatMessagesInput = z.object({
    guid: z.string().min(1),
    with: z.union([z.string(), z.array(z.string())]).optional(),
    ...Pagination
});
const GetHandlesInput = z.object({ ...Pagination });
const GetAttachmentsInput = z.object({ guid: z.string().min(1) });

export interface ReadOperationDeps {
    chatReader: ChatReader;
    handleReader: HandleReader;
    attachmentReader: AttachmentReader;
}

/**
 * Normalize the chat-messages `with` param (a comma-string from the app, or an array)
 * into a Set of trimmed, non-empty tokens. Unknown tokens are kept but ignored by the
 * handler. Absent input yields an empty Set (no hydration).
 */
function wantSet(value: string | string[] | undefined): Set<string> {
    if (value === undefined) return new Set();
    const tokens = Array.isArray(value) ? value : value.split(",");
    return new Set(tokens.map(t => t.trim()).filter(t => t.length > 0));
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
            handler: (_ctx, input) => {
                const chats = deps.chatReader.getChats({ limit: input.limit, offset: input.offset });

                const want = new Set(input.with ?? []);
                // No hydration requested → byte-identical to before (bare serializeChat).
                if (want.size === 0) return { chats: chats.map(row => serializeChat(row)) };

                // Batch-fetch only what's asked for, keyed by chat ROWID, for this page.
                const rowIds = chats.map(c => Number(c["ROWID"]));
                const participants = want.has("participants")
                    ? deps.chatReader.getParticipants(rowIds)
                    : undefined;
                const lastMessages = want.has("lastMessage")
                    ? deps.chatReader.getLastMessages(rowIds)
                    : undefined;

                return {
                    chats: chats.map(row => {
                        const rowId = Number(row["ROWID"]);
                        const extra: ChatExtra = {};
                        if (participants) extra.participants = participants.get(rowId) ?? [];
                        if (lastMessages) extra.lastMessage = lastMessages.get(rowId);
                        return serializeChat(row, extra);
                    })
                };
            }
        }),
        defineOperation({
            name: "get-chat-messages",
            method: "GET",
            path: "/api/v1/chat/:guid/message",
            auth: true,
            input: GetChatMessagesInput,
            summary: "Messages in a chat (newest first)",
            handler: (_ctx, input) => {
                const messages = deps.chatReader.getChatMessages({
                    chatGuid: input.guid,
                    limit: input.limit,
                    offset: input.offset
                });

                const want = wantSet(input.with);
                // No attachment hydration requested → byte-identical to before (bare serializeMessage).
                if (!want.has("attachments") && !want.has("attachment")) {
                    return { messages: messages.map(row => serializeMessage(row)) };
                }

                // Batch-fetch this page's attachments in one query, keyed by message guid.
                const guids = messages.map(row => String(row["guid"]));
                const byGuid = deps.attachmentReader.getMessageAttachmentsBatch(guids);
                return {
                    messages: messages.map(row => {
                        const extra: MessageExtra = { attachments: byGuid.get(String(row["guid"])) ?? [] };
                        return serializeMessage(row, extra);
                    })
                };
            }
        }),
        defineOperation({
            name: "get-handles",
            method: "POST",
            path: "/api/v1/handle/query",
            auth: true,
            input: GetHandlesInput,
            summary: "List handles (addresses)",
            handler: (_ctx, input) => ({
                handles: deps.handleReader.getHandles({ limit: input.limit, offset: input.offset }).map(serializeHandle)
            })
        }),
        defineOperation({
            name: "get-message-attachments",
            method: "GET",
            path: "/api/v1/message/:guid/attachment",
            auth: true,
            input: GetAttachmentsInput,
            summary: "Attachment metadata for a message",
            handler: (_ctx, input) => ({
                attachments: deps.attachmentReader.getMessageAttachments(input.guid).map(serializeAttachment)
            })
        })
    ];
}
