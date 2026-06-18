/**
 * Domain events — the typed channel keys for the {@link EventBus}.
 *
 * The string keys are **frozen**: they mirror the legacy `events.ts` constants
 * and, transitively, the Socket.IO event names clients listen for. Producers emit
 * these; the Socket.IO / FCM / webhook sinks subscribe. Payload shapes are
 * intentionally `unknown` in Phase 0 and get refined to real DTOs once the
 * serializer lands (Phase 1/4) — but the channel set and names are fixed now so
 * the bus is type-checked from the start.
 */
export interface DomainEvents {
    "new-message": unknown;
    "updated-message": unknown;
    "message-send-error": unknown;
    "group-name-change": unknown;
    "group-icon-changed": unknown;
    "group-icon-removed": unknown;
    "participant-added": unknown;
    "participant-removed": unknown;
    "participant-left": unknown;
    "chat-read-status-changed": unknown;
    "typing-indicator": unknown;
    "new-server": string;
    "server-update": unknown;
    "hello-world": unknown;
}
