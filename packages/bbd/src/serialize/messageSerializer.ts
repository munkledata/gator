import { appleDateToUnixMs, isReaction, REACTION_TYPES } from "../data/imessage/appleConstants";

/**
 * The frozen v1 message DTO clients receive. Field names and shapes match the
 * legacy `MessageResponse` exactly (see the server README), so the serializer is a
 * wire-compatibility contract, not just a mapping.
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
    associatedMessageType: number | null;
    /** Decoded reaction name (e.g. "love", "-like") when this is a tapback. */
    reaction: string | null;
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
    const associatedMessageType = numOrNull(row["associated_message_type"]);
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
        associatedMessageType,
        reaction: isReaction(associatedMessageType) ? (REACTION_TYPES[associatedMessageType!] ?? null) : null,
        balloonBundleId: str(row["balloon_bundle_id"]),
        expressiveSendStyleId: str(row["expressive_send_style_id"]),
        threadOriginatorGuid: str(row["thread_originator_guid"]),
        partCount: numOrNull(row["part_count"])
    };
}
