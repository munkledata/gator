import { appleDateToUnixMs } from "../data/imessage/appleConstants";

/**
 * Reaction/associated-message code → wire string, byte-compatible with the legacy
 * `MessageTypeTransformer` (ReactionIdToString): a reaction code maps to its name,
 * 0 maps to null, anything else is the code stringified. Clients parse this field
 * as a string, so emitting a number would break them.
 */
const REACTION_ID_TO_STRING: Readonly<Record<number, string | null>> = {
    0: null,
    1000: "sticker",
    2000: "love",
    2001: "like",
    2002: "dislike",
    2003: "laugh",
    2004: "emphasize",
    2005: "question",
    3000: "-love",
    3001: "-like",
    3002: "-dislike",
    3003: "-laugh",
    3004: "-emphasize",
    3005: "-question"
};

function associatedMessageTypeToString(code: number | null): string | null {
    if (code == null) return null;
    if (code in REACTION_ID_TO_STRING) return REACTION_ID_TO_STRING[code]!;
    return String(code);
}

/**
 * The v1 message DTO clients receive. Field shapes are wire-compatible with the
 * legacy `MessageResponse` (this is a representative subset; more fields are added
 * as the message read operations are migrated).
 */
export interface MessageResponse {
    guid: string;
    text: string | null;
    subject: string | null;
    dateCreated: number | null;
    dateRead: number | null;
    dateDelivered: number | null;
    dateEdited: number | null;
    isFromMe: boolean;
    isDelivered: boolean;
    isRead: boolean;
    isSent: boolean;
    isAudioMessage: boolean;
    itemType: number | null;
    groupTitle: string | null;
    groupActionType: number | null;
    associatedMessageGuid: string | null;
    /** Reaction name (e.g. "love", "-like"), or the stringified code, or null. */
    associatedMessageType: string | null;
    balloonBundleId: string | null;
    expressiveSendStyleId: string | null;
    threadOriginatorGuid: string | null;
    partCount: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

/**
 * Project a raw chat.db message row (from the Phase 3 reader) into the v1 DTO.
 * Dates go through the centralized Cocoa-epoch conversion; reaction codes through
 * the centralized map. Missing columns (older macOS) serialize to null, never throw.
 */
export function serializeMessage(row: Record<string, unknown>): MessageResponse {
    return {
        guid: str(row["guid"]) ?? "",
        text: str(row["text"]),
        subject: str(row["subject"]),
        dateCreated: appleDateToUnixMs(numOrNull(row["date"])),
        dateRead: appleDateToUnixMs(numOrNull(row["date_read"])),
        dateDelivered: appleDateToUnixMs(numOrNull(row["date_delivered"])),
        dateEdited: appleDateToUnixMs(numOrNull(row["date_edited"])),
        isFromMe: bool(row["is_from_me"]),
        isDelivered: bool(row["is_delivered"]),
        isRead: bool(row["is_read"]),
        isSent: bool(row["is_sent"]),
        isAudioMessage: bool(row["is_audio_message"]),
        itemType: numOrNull(row["item_type"]),
        groupTitle: str(row["group_title"]),
        groupActionType: numOrNull(row["group_action_type"]),
        associatedMessageGuid: str(row["associated_message_guid"]),
        associatedMessageType: associatedMessageTypeToString(numOrNull(row["associated_message_type"])),
        balloonBundleId: str(row["balloon_bundle_id"]),
        expressiveSendStyleId: str(row["expressive_send_style_id"]),
        threadOriginatorGuid: str(row["thread_originator_guid"]),
        partCount: numOrNull(row["part_count"])
    };
}
