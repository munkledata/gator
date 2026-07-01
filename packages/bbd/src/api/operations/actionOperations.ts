import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import { NotFoundError } from "../execute";
import type { MessageSender } from "../../messaging/MessageSender";
import { serializeChat } from "../../serialize/chatSerializer";

/**
 * The slice of {@link ChatReader} the group-management ops need to read an updated chat
 * back. A narrow interface (not the concrete class) so it's trivially fakeable in tests;
 * `ChatReader` satisfies it structurally.
 */
export interface ChatBackReader {
    getChatByGuid(guid: string): Record<string, unknown> | undefined;
    getParticipants(chatRowIds: number[]): Map<number, Record<string, unknown>[]>;
}

export interface ActionOperationDeps {
    sender: MessageSender;
    /** Read-only chat.db reader — used to return the updated chat after a group mutation. */
    chatReader: ChatBackReader;
}

/**
 * After a group mutation (rename / participant change) the helper only acks — no chat is
 * returned — so we read the chat back from chat.db with its participants and return
 * `{ chat }` (the shape the RN client's `SingleChat` schema accepts). chat.db lags the
 * action slightly, so this is best-effort; the app re-syncs to the authoritative state.
 */
function readChatBack(chatReader: ChatBackReader, guid: string): { chat: ReturnType<typeof serializeChat> } {
    const row = chatReader.getChatByGuid(guid);
    if (!row) throw new NotFoundError(`no chat with guid ${guid}`);
    const rowId = Number(row["ROWID"]);
    const participants = chatReader.getParticipants([rowId]).get(rowId) ?? [];
    return { chat: serializeChat(row, { participants }) };
}

/**
 * The write/action operations — send, react, typing, mark-read, edit, unsend —
 * the legacy `actions.ts` / socket handlers, defined once on the Phase 4 layer and
 * routed through the {@link MessageSender} (Private API first, with the real GUID
 * ack; AppleScript fallback only for plain text). Fidelity actions error cleanly
 * when the helper isn't injected.
 */
export function buildActionOperations(deps: ActionOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "send-message",
            method: "POST",
            path: "/api/v1/message/text",
            auth: true,
            input: z.object({
                chatGuid: z.string().min(1),
                text: z.string().optional(),
                subject: z.string().optional(),
                effectId: z.string().optional(),
                selectedMessageGuid: z.string().optional(),
                partIndex: z.coerce.number().int().min(0).optional(),
                ddScan: z.coerce.boolean().optional(),
                tempGuid: z.string().optional(),
                attributedBody: z.unknown().optional()
            }),
            summary: "Send a text message (effects, replies, attributed body via Private API)",
            handler: (_ctx, input) => deps.sender.sendText(input)
        }),
        defineOperation({
            name: "new-chat",
            method: "POST",
            path: "/api/v1/chat/new",
            auth: true,
            input: z.object({
                addresses: z.array(z.string().min(1)).min(1),
                message: z.string().min(1),
                service: z.string().optional(),
                method: z.string().optional()
            }),
            summary: "Create a chat with addresses + an initial message (Private API)",
            handler: async (_ctx, input) => {
                const { guid } = await deps.sender.createChat({
                    addresses: input.addresses,
                    service: input.service,
                    message: input.message
                });
                // The RN Chat schema requires only `guid`; the rest hydrates from the chat sync.
                return { guid };
            }
        }),
        defineOperation({
            name: "send-attachment",
            method: "POST",
            path: "/api/v1/message/attachment",
            auth: true,
            input: z.object({
                chatGuid: z.string().min(1),
                name: z.string().min(1),
                // Base64-encoded file bytes (kept on the JSON envelope — no extra dep).
                data: z.string().min(1),
                isAudioMessage: z.coerce.boolean().optional(),
                subject: z.string().optional(),
                effectId: z.string().optional(),
                selectedMessageGuid: z.string().optional(),
                partIndex: z.coerce.number().int().min(0).optional(),
                tempGuid: z.string().optional()
            }),
            summary: "Send a file attachment (Private API)",
            handler: (_ctx, input) =>
                deps.sender.sendAttachment({
                    chatGuid: input.chatGuid,
                    name: input.name,
                    dataBase64: input.data,
                    isAudioMessage: input.isAudioMessage,
                    subject: input.subject,
                    effectId: input.effectId,
                    selectedMessageGuid: input.selectedMessageGuid,
                    partIndex: input.partIndex,
                    tempGuid: input.tempGuid
                })
        }),
        defineOperation({
            name: "send-reaction",
            method: "POST",
            path: "/api/v1/message/react",
            auth: true,
            input: z.object({
                chatGuid: z.string().min(1),
                messageGuid: z.string().min(1),
                reactionType: z.string().min(1),
                partIndex: z.coerce.number().int().min(0).optional()
            }),
            summary: "Send a tapback (Private API)",
            handler: (_ctx, input) => deps.sender.sendReaction(input)
        }),
        defineOperation({
            name: "start-typing",
            method: "POST",
            path: "/api/v1/chat/:guid/typing",
            auth: true,
            input: z.object({ guid: z.string().min(1) }),
            summary: "Start the typing indicator (Private API)",
            handler: async (_ctx, input) => {
                await deps.sender.setTyping(input.guid, true);
                return { typing: true };
            }
        }),
        defineOperation({
            name: "stop-typing",
            method: "DELETE",
            path: "/api/v1/chat/:guid/typing",
            auth: true,
            input: z.object({ guid: z.string().min(1) }),
            summary: "Stop the typing indicator (Private API)",
            handler: async (_ctx, input) => {
                await deps.sender.setTyping(input.guid, false);
                return { typing: false };
            }
        }),
        defineOperation({
            name: "mark-chat-read",
            method: "POST",
            path: "/api/v1/chat/:guid/read",
            auth: true,
            input: z.object({ guid: z.string().min(1) }),
            summary: "Mark a chat read (Private API)",
            handler: async (_ctx, input) => {
                await deps.sender.markRead(input.guid);
                return { read: true };
            }
        }),
        defineOperation({
            name: "edit-message",
            method: "POST",
            path: "/api/v1/message/:guid/edit",
            auth: true,
            input: z.object({
                guid: z.string().min(1),
                chatGuid: z.string().min(1),
                editedText: z.string(),
                backwardsCompatText: z.string().optional(),
                partIndex: z.coerce.number().int().min(0).optional()
            }),
            summary: "Edit a sent message (Private API, macOS 13+)",
            handler: (_ctx, input) =>
                deps.sender.editMessage({
                    chatGuid: input.chatGuid,
                    messageGuid: input.guid,
                    editedText: input.editedText,
                    backwardsCompatText: input.backwardsCompatText,
                    partIndex: input.partIndex
                })
        }),
        defineOperation({
            name: "unsend-message",
            method: "POST",
            path: "/api/v1/message/:guid/unsend",
            auth: true,
            input: z.object({
                guid: z.string().min(1),
                chatGuid: z.string().min(1),
                partIndex: z.coerce.number().int().min(0).optional()
            }),
            summary: "Unsend a message (Private API, macOS 13+)",
            handler: async (_ctx, input) => {
                await deps.sender.unsendMessage({ chatGuid: input.chatGuid, messageGuid: input.guid, partIndex: input.partIndex });
                return { unsent: true };
            }
        }),
        // ── Group management (Private API — helper drives IMChat directly) ─────────────
        defineOperation({
            name: "rename-chat",
            method: "PUT",
            path: "/api/v1/chat/:guid",
            auth: true,
            // displayName may be empty (clearing a group's custom name is valid in iMessage).
            input: z.object({ guid: z.string().min(1), displayName: z.string() }),
            summary: "Rename a group chat (Private API)",
            handler: async (_ctx, input) => {
                await deps.sender.renameChat(input.guid, input.displayName);
                return readChatBack(deps.chatReader, input.guid);
            }
        }),
        defineOperation({
            name: "update-participant",
            method: "POST",
            path: "/api/v1/chat/:guid/participant/:action",
            auth: true,
            input: z.object({
                guid: z.string().min(1),
                action: z.enum(["add", "remove"]),
                address: z.string().min(1)
            }),
            summary: "Add or remove a group participant (Private API)",
            handler: async (_ctx, input) => {
                if (input.action === "add") await deps.sender.addParticipant(input.guid, input.address);
                else await deps.sender.removeParticipant(input.guid, input.address);
                return readChatBack(deps.chatReader, input.guid);
            }
        }),
        defineOperation({
            name: "leave-chat",
            method: "POST",
            path: "/api/v1/chat/:guid/leave",
            auth: true,
            input: z.object({ guid: z.string().min(1) }),
            summary: "Leave a group chat (Private API)",
            handler: async (_ctx, input) => {
                await deps.sender.leaveChat(input.guid);
                return { left: true };
            }
        })
    ];
}
