/**
 * The v1 chat DTO. Field shapes are wire-compatible with the legacy `ChatResponse`
 * (guid, chatIdentifier, displayName, style, isArchived, groupId).
 */
export interface ChatResponse {
    guid: string;
    chatIdentifier: string | null;
    displayName: string | null;
    style: number | null;
    isArchived: boolean;
    groupId: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

export function serializeChat(row: Record<string, unknown>): ChatResponse {
    return {
        guid: str(row["guid"]) ?? "",
        chatIdentifier: str(row["chat_identifier"]),
        displayName: str(row["display_name"]),
        style: numOrNull(row["style"]),
        isArchived: bool(row["is_archived"]),
        groupId: str(row["group_id"])
    };
}
