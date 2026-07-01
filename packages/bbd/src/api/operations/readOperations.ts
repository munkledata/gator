import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import { NotFoundError } from "../execute";
import type { ChatReader } from "../../data/imessage/ChatReader";
import type { HandleReader } from "../../data/imessage/HandleReader";
import type { AttachmentReader } from "../../data/imessage/AttachmentReader";
import type { MessageReader } from "../../data/imessage/MessageReader";
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

// Global incremental message query (app wake/reconnect sync). The app pages every
// message after a global cursor, oldest-first, to update its DB. `limit` is clamped to a
// sane max so a hostile/huge value can't pull the whole table in one shot. `afterRowId`
// is the preferred cursor; `after`/`afterTimestamp` are the Unix-ms fallback (the app
// sends `after`, alias `afterTimestamp` is also accepted). `with` mirrors the chat-
// messages param (comma-string or array → Set via wantSet); `sort` is accepted and
// ignored (the query is always oldest-first, which is what the app requests with 'ASC').
const QUERY_MESSAGES_MAX_LIMIT = 1000;
const QueryMessagesInput = z.object({
    limit: z.coerce.number().int().min(1).optional(),
    afterRowId: z.coerce.number().int().min(0).optional(),
    after: z.coerce.number().int().min(0).optional(),
    afterTimestamp: z.coerce.number().int().min(0).optional(),
    with: z.union([z.string(), z.array(z.string())]).optional(),
    sort: z.string().optional()
});

export interface ReadOperationDeps {
    chatReader: ChatReader;
    handleReader: HandleReader;
    attachmentReader: AttachmentReader;
    messageReader: MessageReader;
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
            name: "get-chat",
            method: "GET",
            path: "/api/v1/chat/:guid",
            auth: true,
            input: z.object({
                guid: z.string().min(1),
                with: z.union([z.string(), z.array(z.string())]).optional()
            }),
            summary: "Get a single chat by guid (optionally with participants / lastMessage)",
            handler: (_ctx, input) => {
                const row = deps.chatReader.getChatByGuid(input.guid);
                if (!row) throw new NotFoundError(`no chat with guid ${input.guid}`);
                // Tokens are lowercased so the app's "lastmessage" matches getLastMessages.
                const want = new Set([...wantSet(input.with)].map(t => t.toLowerCase()));
                const rowId = Number(row["ROWID"]);
                const extra: ChatExtra = {};
                if (want.has("participants")) {
                    extra.participants = deps.chatReader.getParticipants([rowId]).get(rowId) ?? [];
                }
                if (want.has("lastmessage")) {
                    extra.lastMessage = deps.chatReader.getLastMessages([rowId]).get(rowId);
                }
                return { chat: serializeChat(row, extra) };
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
            name: "query-messages",
            method: "POST",
            path: "/api/v1/message/query",
            auth: true,
            input: QueryMessagesInput,
            summary: "Global incremental message query (oldest-first, after a cursor)",
            handler: (_ctx, input) => {
                const limit = Math.min(input.limit ?? QUERY_MESSAGES_MAX_LIMIT, QUERY_MESSAGES_MAX_LIMIT);
                // ROWID cursor preferred; fall back to the app's Unix-ms cursor (either key).
                const afterTimestamp = input.after ?? input.afterTimestamp;
                const messages = deps.messageReader.queryAfter({
                    afterRowId: input.afterRowId,
                    afterTimestamp,
                    limit
                });

                const want = wantSet(input.with);
                const wantChats = want.has("chats");
                const wantHandle = want.has("handle");
                const wantAttachments = want.has("attachments") || want.has("attachment");

                // No hydration requested → byte-identical bare serializeMessage per row.
                if (!wantChats && !wantHandle && !wantAttachments) {
                    return { messages: messages.map(row => serializeMessage(row)) };
                }

                // Batch-fetch only what's asked for, for this page, keyed for re-attachment.
                const rowIds = messages.map(row => Number(row["ROWID"]));
                const chatsByMsg = wantChats ? deps.chatReader.getChatsForMessages(rowIds) : undefined;

                let handlesByRowId: Map<number, Record<string, unknown>> | undefined;
                if (wantHandle) {
                    const handleIds = [
                        ...new Set(
                            messages
                                .map(row => Number(row["handle_id"]))
                                .filter(id => Number.isFinite(id) && id > 0)
                        )
                    ];
                    handlesByRowId = deps.handleReader.getHandlesByRowIds(handleIds);
                }

                const attsByGuid = wantAttachments
                    ? deps.attachmentReader.getMessageAttachmentsBatch(messages.map(row => String(row["guid"])))
                    : undefined;

                return {
                    messages: messages.map(row => {
                        const extra: MessageExtra = {};
                        if (chatsByMsg) extra.chats = chatsByMsg.get(Number(row["ROWID"])) ?? [];
                        if (handlesByRowId) extra.handle = handlesByRowId.get(Number(row["handle_id"])) ?? null;
                        if (attsByGuid) extra.attachments = attsByGuid.get(String(row["guid"])) ?? [];
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
