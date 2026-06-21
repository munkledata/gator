import { appleDateToUnixMs } from "../data/imessage/appleConstants";
import type { MessageV1 } from "@bluebubbles/protocol";

/**
 * The canonical wire shape lives in `@bluebubbles/protocol` (the frozen v1 contract).
 * Re-exported under the legacy name for back-compat; {@link serializeMessage} is
 * annotated to return it, so `tsc` enforces field-for-field conformance.
 */
export type { MessageV1 as MessageResponse } from "@bluebubbles/protocol";

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

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

/**
 * Project a raw chat.db message row (from the Phase 3 reader) into the v1 DTO.
 * Dates go through the centralized Cocoa-epoch conversion; reaction codes through
 * the centralized map. Missing columns (older macOS) serialize to null, never throw.
 */
export function serializeMessage(row: Record<string, unknown>): MessageV1 {
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
        wasDeliveredQuietly: bool(row["was_delivered_quietly"]),
        didNotifyRecipient: bool(row["did_notify_recipient"]),
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
