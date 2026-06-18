import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { MessageSender } from "../../messaging/MessageSender";

export interface ActionOperationDeps {
    sender: MessageSender;
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
            input: z.object({ chatGuid: z.string().min(1), text: z.string().optional(), subject: z.string().optional() }),
            summary: "Send a text message",
            handler: (_ctx, input) => deps.sender.sendText(input)
        }),
        defineOperation({
            name: "send-reaction",
            method: "POST",
            path: "/api/v1/message/react",
            auth: true,
            input: z.object({
                chatGuid: z.string().min(1),
                messageGuid: z.string().min(1),
                reactionType: z.string().min(1)
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
        })
    ];
}
