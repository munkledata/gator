/**
 * BlueBubbles v1 per-entity wire DTOs — **FROZEN**.
 *
 * These are the canonical shapes the server emits inside the {@link ResponseFormat}
 * envelope (`data`) for each domain entity. Like the envelope, thousands of deployed
 * Android/iOS/desktop/web clients parse these fields by name, so this contract must
 * remain byte-compatible forever. New, additive fields are allowed; renames/removals
 * are not.
 *
 * This file is the single typed source of truth for those shapes. The `bbd`
 * serializers (`serializeMessage`/`serializeChat`/`serializeHandle`/`serializeAttachment`)
 * are annotated to return these interfaces, so `tsc` fails the moment a serializer
 * drops or renames a field versus this contract.
 */

/**
 * The v1 message DTO clients receive. Field shapes are wire-compatible with the
 * legacy `MessageResponse` (this is a representative subset; more fields are added
 * as the message read operations are migrated).
 */
export interface MessageV1 {
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
    /** Apple delivered-tier flags: message delivered without a recipient notification. */
    wasDeliveredQuietly: boolean;
    /** Apple delivered-tier flags: recipient was notified of delivery. */
    didNotifyRecipient: boolean;
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

/**
 * The v1 chat DTO. Field shapes are wire-compatible with the legacy `ChatResponse`
 * (guid, chatIdentifier, displayName, style, isArchived, groupId).
 *
 * `participants` and `lastMessage` are additive: they appear only when the caller
 * passed the matching `with` hydration (and supplied `extra`). A no-`with` query is
 * byte-identical to before — the keys are omitted entirely, not set to undefined.
 */
export interface ChatV1 {
    guid: string;
    chatIdentifier: string | null;
    displayName: string | null;
    style: number | null;
    isArchived: boolean;
    groupId: string | null;
    participants?: HandleV1[];
    lastMessage?: MessageV1 | null;
}

/** v1 handle DTO — wire-compatible with the legacy HandleResponse. */
export interface HandleV1 {
    address: string;
    country: string | null;
    uncanonicalizedId: string | null;
    service: string | null;
}

/** v1 attachment DTO (metadata) — wire-compatible subset of the legacy AttachmentResponse. */
export interface AttachmentV1 {
    guid: string;
    uti: string | null;
    mimeType: string | null;
    transferName: string | null;
    totalBytes: number | null;
    isSticker: boolean;
    hideAttachment: boolean;
}

/**
 * The v1 `GET /api/v1/server/info` payload. `server_version` is the field upstream
 * (and the app) actually reads for the version; `version` is kept for parity.
 * `proxy_service` is the active tunnel provider name, or null when none is configured.
 */
export interface ServerInfoV1 {
    version: string;
    server_version: string;
    private_api: boolean;
    proxy_service: string | null;
    supports_header_auth: boolean;
}

/**
 * The v1 scheduled-message wire shape returned by the scheduled-message operations.
 * The persisted record carries additional bookkeeping (createdAt, error), but only
 * these fields are part of the frozen wire contract.
 */
export interface ScheduledMessageV1 {
    id: string;
    chatGuid: string;
    text: string;
    /** When to send, Unix ms. */
    scheduledFor: number;
    status: string;
}
