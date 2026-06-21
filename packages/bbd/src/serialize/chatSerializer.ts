import { serializeHandle } from "./handleSerializer";
import { serializeMessage } from "./messageSerializer";
import type { ChatV1 } from "@bluebubbles/protocol";

/**
 * The canonical wire shape lives in `@bluebubbles/protocol` (the frozen v1 contract).
 * Re-exported under the legacy name for back-compat; {@link serializeChat} is
 * annotated to return it, so `tsc` enforces field-for-field conformance. The
 * additive `participants?` / `lastMessage?` hydration fields are part of `ChatV1`.
 */
export type { ChatV1 as ChatResponse } from "@bluebubbles/protocol";

/** Optional hydration the chat-query handler batch-fetches and threads in per chat. */
export interface ChatExtra {
    participants?: Record<string, unknown>[];
    lastMessage?: Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

export function serializeChat(row: Record<string, unknown>, extra?: ChatExtra): ChatV1 {
    const out: ChatV1 = {
        guid: str(row["guid"]) ?? "",
        chatIdentifier: str(row["chat_identifier"]),
        displayName: str(row["display_name"]),
        style: numOrNull(row["style"]),
        isArchived: bool(row["is_archived"]),
        groupId: str(row["group_id"])
    };
    // Presence (the property existing on `extra`), not value, drives the wire fields:
    // an absent property means the hydration wasn't requested (key omitted); a present
    // one means it was, so it always emits — even when empty (`[]` / `null`).
    if (extra && "participants" in extra) out.participants = (extra.participants ?? []).map(serializeHandle);
    if (extra && "lastMessage" in extra) out.lastMessage = extra.lastMessage ? serializeMessage(extra.lastMessage) : null;
    return out;
}
