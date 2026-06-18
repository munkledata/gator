import type { Logger } from "../core/logger";
import type { PrivateApiTransport } from "../private-api/PrivateApiTransport";
import type { AppleScriptFallback } from "./appleScriptFallback";

export interface SendTextInput {
    chatGuid: string;
    text?: string;
    subject?: string;
}

export interface SendReactionInput {
    chatGuid: string;
    messageGuid: string;
    reactionType: string;
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
                data: { chatGuid: input.chatGuid, message: input.text ?? "", subject: input.subject }
            });
            if (res.error) throw new Error(res.error);
            return { guid: res.identifier, viaPrivateApi: true };
        }
        this.#logger.debug("helper not connected; using AppleScript fallback");
        await this.#fallback.sendText(input);
        return { viaPrivateApi: false };
    }

    async sendReaction(input: SendReactionInput): Promise<SendResult> {
        return this.#privateApi("send-reaction", {
            chatGuid: input.chatGuid,
            messageGuid: input.messageGuid,
            reactionType: input.reactionType
        });
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
