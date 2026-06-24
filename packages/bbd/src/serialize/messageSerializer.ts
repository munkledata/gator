import { appleDateToUnixMs } from "../data/imessage/appleConstants";
import { attributedBodyText } from "../data/imessage/attributedBody";
import { serializeAttachment } from "./attachmentSerializer";
import { serializeChat } from "./chatSerializer";
import { serializeHandle } from "./handleSerializer";
import type { MessageV1 } from "@bluebubbles/protocol";

/** Optional hydration the chat-messages handler batch-fetches and threads in per message. */
export interface MessageExtra {
    attachments?: Record<string, unknown>[];
    /** Chats this message belongs to (incremental sync routes on `chats[0].guid`). */
    chats?: Record<string, unknown>[];
    /** The message's sender handle; `null` when not resolvable (e.g. is-from-me). */
    handle?: Record<string, unknown> | null;
}

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

/** The `text` column, or — when it's empty (edited messages) — the decoded attributedBody. */
function textOf(row: Record<string, unknown>): string | null {
    const col = str(row["text"]);
    if (col && col.length > 0) return col;
    return attributedBodyText(row["attributedBody"]);
}

/**
 * Project a raw chat.db message row (from the Phase 3 reader) into the v1 DTO.
 * Dates go through the centralized Cocoa-epoch conversion; reaction codes through
 * the centralized map. Missing columns (older macOS) serialize to null, never throw.
 */
export function serializeMessage(row: Record<string, unknown>, extra?: MessageExtra): MessageV1 {
    const out: MessageV1 = {
        guid: str(row["guid"]) ?? "",
        // The chat.db ROWID, exposed under the legacy BlueBubbles field name. The app's
        // incremental sync advances its global cursor by MAX(originalROWID) per page and
        // sends it back as `afterRowId` — the monotonic, tie-free cursor (see queryAfter).
        // Null when the source row didn't project ROWID (e.g. a hydrated lastMessage).
        originalROWID: numOrNull(row["ROWID"]),
        // An EDITED message empties the `text` column and keeps its latest text in the
        // attributedBody typedstream — recover it so the edit doesn't serialize blank.
        text: textOf(row),
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
    // Presence (the property existing on `extra`), not value, drives each wire field: an
    // absent property means that hydration wasn't requested (key omitted — byte-identical
    // to before); a present one always emits, even when empty (`[]` / `null`).
    if (extra && "attachments" in extra) out.attachments = (extra.attachments ?? []).map(serializeAttachment);
    if (extra && "chats" in extra) out.chats = (extra.chats ?? []).map(row => serializeChat(row));
    if (extra && "handle" in extra) out.handle = extra.handle ? serializeHandle(extra.handle) : null;
    return out;
}
