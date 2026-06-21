import { serializeHandle, type HandleResponse } from "./handleSerializer";
import { serializeMessage, type MessageResponse } from "./messageSerializer";

/**
 * The v1 chat DTO. Field shapes are wire-compatible with the legacy `ChatResponse`
 * (guid, chatIdentifier, displayName, style, isArchived, groupId).
 *
 * `participants` and `lastMessage` are additive: they appear only when the caller
 * passed the matching `with` hydration (and supplied `extra`). A no-`with` query is
 * byte-identical to before — the keys are omitted entirely, not set to undefined.
 */
export interface ChatResponse {
    guid: string;
    chatIdentifier: string | null;
    displayName: string | null;
    style: number | null;
    isArchived: boolean;
    groupId: string | null;
    participants?: HandleResponse[];
    lastMessage?: MessageResponse | null;
}

/** Optional hydration the chat-query handler batch-fetches and threads in per chat. */
export interface ChatExtra {
    participants?: Record<string, unknown>[];
    lastMessage?: Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

export function serializeChat(row: Record<string, unknown>, extra?: ChatExtra): ChatResponse {
    const out: ChatResponse = {
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
