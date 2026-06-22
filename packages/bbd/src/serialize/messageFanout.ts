import type { EventBus } from "../core/bus";
import type { DomainEvents } from "../events";
import type { Logger } from "../core/logger";
import { serializeMessage, type MessageExtra } from "./messageSerializer";

/**
 * Hydration the fanout resolves per live message so the emitted DTO carries the same
 * chat/sender association the sync (query) path does. The raw chat.db row from
 * `MessageReader.readSince` projects only message-table columns (no chat join, no handle),
 * so without this the live `new-message`/`updated-message` DTO had no `chats[]`/`handle` —
 * and the app, which routes incoming messages on `chats[0].guid`, couldn't place them in a
 * conversation (audit F1). Returns empty/null on a miss; never throws.
 */
export interface FanoutHydration {
    chats: Record<string, unknown>[];
    handle: Record<string, unknown> | null;
}

export interface MessageFanoutDeps {
    /** Push to connected clients (e.g. Socket.IO emit). */
    emit: (type: string, dto: unknown) => void;
    /** Hand off to the webhook subscriber. */
    webhook: (type: string, dto: unknown) => void | Promise<void>;
    /** Deliver a push notification to registered devices (optional sink). */
    notify?: (type: "new-message" | "updated-message", dto: unknown) => void | Promise<void>;
    /**
     * Resolve the message's chats[] + sender handle from the raw row (by ROWID / handle_id).
     * Injected so this module stays free of the chat.db readers. Optional: when absent the
     * DTO omits chats[]/handle exactly as before (back-compat for callers/tests).
     */
    hydrate?: (row: Record<string, unknown>) => FanoutHydration;
    /** Logged when hydration throws so a bad row degrades to an unhydrated DTO, not a crash. */
    logger?: Logger;
}

/** First chat's guid, for the top-level `chatGuid` robustness field; null when unknown. */
function firstChatGuid(chats: Record<string, unknown>[]): string | null {
    const guid = chats[0]?.["guid"];
    return typeof guid === "string" ? guid : null;
}

/**
 * The "serialize once → fan out to sinks" flow, wired live: subscribe the new/updated
 * message domain events, hydrate the raw row's chat association + sender handle, serialize
 * the row to the v1 DTO exactly once (now WITH `chats[]`/`handle`, matching the sync path),
 * attach a top-level `chatGuid` for robustness, then deliver to the Socket.IO sink, the
 * webhook sink, and (optionally) the push-notification sink. The producer (IMessageListener)
 * stays oblivious to the sinks.
 */
export function wireMessageFanout(bus: EventBus<DomainEvents>, deps: MessageFanoutDeps): void {
    const handler = (type: "new-message" | "updated-message") => (raw: unknown) => {
        const row = (raw ?? {}) as Record<string, unknown>;

        // Hydrate chats[]/handle so the live DTO carries the chat association (audit F1). A
        // hydration failure must not drop the event — degrade to an unhydrated DTO and log.
        let extra: MessageExtra | undefined;
        let chatGuid: string | null = null;
        if (deps.hydrate) {
            try {
                const h = deps.hydrate(row);
                extra = { chats: h.chats, handle: h.handle };
                chatGuid = firstChatGuid(h.chats);
            } catch (e) {
                deps.logger?.error("live message hydration failed; emitting without chats[]/handle", e);
            }
        }

        const message = serializeMessage(row, extra);
        // Belt-and-suspenders: a top-level `chatGuid` alongside the hydrated `chats[]` so a
        // client can route even if it only reads the flat field. Omitted when unknown.
        const dto: Record<string, unknown> = chatGuid != null ? { ...message, chatGuid } : { ...message };

        deps.emit(type, dto);
        // Fire-and-forget sinks must not surface as unhandled rejections (audit F19).
        Promise.resolve(deps.webhook(type, dto)).catch(e => deps.logger?.error(`webhook fanout (${type}) failed`, e));
        if (deps.notify) {
            Promise.resolve(deps.notify(type, dto)).catch(e => deps.logger?.error(`push fanout (${type}) failed`, e));
        }
    };
    bus.on("new-message", handler("new-message"));
    bus.on("updated-message", handler("updated-message"));
}
