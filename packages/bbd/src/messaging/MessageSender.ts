import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { Logger } from "../core/logger";
import type { PrivateApiTransport } from "../private-api/PrivateApiTransport";
import type { AppleScriptFallback } from "./appleScriptFallback";

export interface SendTextInput {
    chatGuid: string;
    text?: string;
    subject?: string;
    /** Screen/bubble effect id (e.g. "com.apple.MobileSMS.expressivesend.impact"). */
    effectId?: string;
    /** GUID of the message being replied to (threaded reply). */
    selectedMessageGuid?: string;
    /** Part index of the replied-to message (for multi-part messages). */
    partIndex?: number;
    /** Run data-detector (link/date) scanning on the text. */
    ddScan?: boolean;
    /** Client-supplied correlation id, echoed back for optimistic-send matching. */
    tempGuid?: string;
    /** Serialized attributed body for rich text (passed through to the helper). */
    attributedBody?: unknown;
}

export interface SendAttachmentInput {
    chatGuid: string;
    /** File name (used for the on-disk temp name and the attachment name). */
    name: string;
    /** Base64-encoded file bytes. */
    dataBase64: string;
    isAudioMessage?: boolean;
    subject?: string;
    effectId?: string;
    selectedMessageGuid?: string;
    partIndex?: number;
    tempGuid?: string;
}

export interface SendReactionInput {
    chatGuid: string;
    messageGuid: string;
    reactionType: string;
    /** Message part to react to (multi-part messages); defaults to 0. */
    partIndex?: number;
}

export interface SendResult {
    /** The real message GUID when sent via the Private API (the ack); absent on the AppleScript path. */
    guid?: string;
    viaPrivateApi: boolean;
}

/**
 * The single send entry point, replacing the legacy fork scattered across
 * `actions.ts` and `outgoingMessageManager`. Prefers the Private API (full
 * fidelity + a real GUID ack) and falls back to AppleScript only for plain text
 * when the helper isn't injected. Fidelity features (reactions, effects, edits)
 * require the Private API and error clearly without it — no silent GUI-scripting.
 */
export class MessageSender {
    readonly #transport: PrivateApiTransport;
    readonly #fallback: AppleScriptFallback;
    readonly #logger: Logger;

    constructor(transport: PrivateApiTransport, fallback: AppleScriptFallback, logger: Logger) {
        this.#transport = transport;
        this.#fallback = fallback;
        this.#logger = logger.child({ component: "MessageSender" });
    }

    async sendText(input: SendTextInput): Promise<SendResult> {
        if (this.#transport.isConnected()) {
            const res = await this.#transport.send({
                action: "send-message",
                data: compact({
                    chatGuid: input.chatGuid,
                    message: input.text ?? "",
                    subject: input.subject,
                    effectId: input.effectId,
                    selectedMessageGuid: input.selectedMessageGuid,
                    partIndex: input.partIndex,
                    ddScan: input.ddScan,
                    tempGuid: input.tempGuid,
                    attributedBody: input.attributedBody
                })
            });
            if (res.error) throw new Error(res.error);
            return { guid: res.identifier, viaPrivateApi: true };
        }
        // Fidelity fields (effects, replies, attributed text, subject) need the Private
        // API; the AppleScript fallback can only send plain text.
        this.#logger.debug("helper not connected; using AppleScript fallback (plain text only)");
        await this.#fallback.sendText({ chatGuid: input.chatGuid, text: input.text });
        return { viaPrivateApi: false };
    }

    /**
     * Send a file as an attachment via the Private API. The bytes arrive base64-encoded
     * over the JSON API; we materialize them to a temp file the helper can read, then
     * remove it once the send is acked. Restores the attachment-send capability the fork
     * had dropped entirely.
     */
    async sendAttachment(input: SendAttachmentInput): Promise<SendResult> {
        if (!this.#transport.isConnected()) {
            throw new Error('"send-attachment" requires the Private API (helper not connected)');
        }
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gator-att-"));
        const safeName = path.basename(input.name || "attachment");
        const filePath = path.join(dir, safeName);
        await fs.writeFile(filePath, Buffer.from(input.dataBase64, "base64"));
        try {
            const res = await this.#transport.send({
                action: "send-attachment",
                data: compact({
                    chatGuid: input.chatGuid,
                    attachmentPath: filePath,
                    attachmentName: safeName,
                    isAudioMessage: input.isAudioMessage ?? false,
                    subject: input.subject,
                    effectId: input.effectId,
                    selectedMessageGuid: input.selectedMessageGuid,
                    partIndex: input.partIndex,
                    tempGuid: input.tempGuid
                })
            });
            if (res.error) throw new Error(res.error);
            return { guid: res.identifier, viaPrivateApi: true };
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    }

    async sendReaction(input: SendReactionInput): Promise<SendResult> {
        return this.#privateApi("send-reaction", {
            chatGuid: input.chatGuid,
            // The dylib's reaction handler keys off `selectedMessageGuid` + `partIndex`
            // (not `messageGuid`) — sending `messageGuid` here silently no-op'd tapbacks.
            selectedMessageGuid: input.messageGuid,
            partIndex: input.partIndex ?? 0,
            reactionType: input.reactionType
        });
    }

    /**
     * Create a new chat with the given addresses and send an initial message. The helper
     * builds the IMChat via IMChatRegistry, sends the message, and returns the new chat's
     * GUID (not just the message ack) so the client can open the thread. Requires the
     * Private API — there's no AppleScript path for starting a brand-new conversation.
     */
    async createChat(input: { addresses: string[]; service?: string; message: string }): Promise<{ guid: string }> {
        if (!this.#transport.isConnected()) {
            throw new Error('"new-chat" requires the Private API (helper not connected)');
        }
        const res = await this.#transport.send({
            action: "create-chat",
            data: compact({
                addresses: input.addresses,
                service: input.service ?? "iMessage",
                // The helper reads the initial message text under `message` (same key send uses).
                message: input.message
            })
        });
        if (res.error) throw new Error(res.error);
        const guid = res.data?.["chatGuid"];
        if (typeof guid !== "string" || guid.length === 0) {
            throw new Error("create-chat: helper returned no chat guid");
        }
        return { guid };
    }

    async setTyping(chatGuid: string, isTyping: boolean): Promise<void> {
        await this.#privateApi(isTyping ? "start-typing" : "stop-typing", { chatGuid });
    }

    async markRead(chatGuid: string): Promise<void> {
        await this.#privateApi("mark-chat-read", { chatGuid });
    }

    async editMessage(input: {
        chatGuid: string;
        messageGuid: string;
        editedText: string;
        backwardsCompatText?: string;
        partIndex?: number;
    }): Promise<SendResult> {
        return this.#privateApi("edit-message", {
            chatGuid: input.chatGuid,
            messageGuid: input.messageGuid,
            editedMessage: input.editedText,
            backwardsCompatibilityMessage: input.backwardsCompatText ?? input.editedText,
            partIndex: input.partIndex ?? 0
        });
    }

    async unsendMessage(input: { chatGuid: string; messageGuid: string; partIndex?: number }): Promise<void> {
        await this.#privateApi("unsend-message", {
            chatGuid: input.chatGuid,
            messageGuid: input.messageGuid,
            partIndex: input.partIndex ?? 0
        });
    }

    /** Shared Private-API call: requires the helper, surfaces errors, returns the GUID ack. */
    async #privateApi(action: string, data: Record<string, unknown>): Promise<SendResult> {
        if (!this.#transport.isConnected()) {
            throw new Error(`"${action}" requires the Private API (helper not connected)`);
        }
        const res = await this.#transport.send({ action, data });
        if (res.error) throw new Error(res.error);
        return { guid: res.identifier, viaPrivateApi: true };
    }
}

/** Drop undefined keys so optional fidelity fields aren't sent as nulls to the helper. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
