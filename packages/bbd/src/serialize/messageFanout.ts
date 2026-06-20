import type { EventBus } from "../core/bus";
import type { DomainEvents } from "../events";
import { serializeMessage } from "./messageSerializer";

export interface MessageFanoutDeps {
    /** Push to connected clients (e.g. Socket.IO emit). */
    emit: (type: string, dto: unknown) => void;
    /** Hand off to the webhook subscriber. */
    webhook: (type: string, dto: unknown) => void | Promise<void>;
    /** Deliver a push notification to registered devices (optional sink). */
    notify?: (type: "new-message" | "updated-message", dto: unknown) => void | Promise<void>;
}

/**
 * The Phase 1 "serialize once → fan out to sinks" flow, wired live: subscribe the
 * new/updated message domain events, serialize the raw chat.db row to the v1 DTO
 * exactly once, then deliver to the Socket.IO sink, the webhook sink, and (optionally)
 * the push-notification sink. The producer (IMessageListener) stays oblivious to the
 * sinks.
 */
export function wireMessageFanout(bus: EventBus<DomainEvents>, deps: MessageFanoutDeps): void {
    const handler = (type: "new-message" | "updated-message") => (row: unknown) => {
        const dto = serializeMessage((row ?? {}) as Record<string, unknown>);
        deps.emit(type, dto);
        void deps.webhook(type, dto);
        if (deps.notify) void deps.notify(type, dto);
    };
    bus.on("new-message", handler("new-message"));
    bus.on("updated-message", handler("updated-message"));
}
