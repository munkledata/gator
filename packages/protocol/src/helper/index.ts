/**
 * bb-helper-proto — the wire contract between the daemon and the injected Obj-C
 * helper dylib. These are plain TS types (the package stays dependency-free); the
 * daemon validates defensively at the transport boundary, and the Obj-C dylib
 * mirrors the same shapes. Sharing the *types* here is what stops `action` from
 * being an undocumented magic string and versions the framing/handshake.
 */

/** 1 = legacy newline-delimited TCP; 2 = length-prefixed framed Unix-domain socket. */
export const HELPER_PROTOCOL_VERSION = 2;

/** First frame the dylib sends after connecting. Authenticates + negotiates. */
export interface HelperHandshake {
    protocolVersion: number;
    /** Shared secret (the daemon hands it to the dylib at injection time). */
    secret: string;
    /** Bundle id of the host process, for per-app routing (Messages vs FaceTime). */
    process?: string;
}

/** A request the daemon sends to the dylib (a private-API action). */
export interface HelperRequest {
    transactionId: string;
    action: string;
    data?: Record<string, unknown>;
}

/**
 * A message from the dylib: either a transaction *response* (carries transactionId,
 * and `identifier` = the real message GUID for acks) or a pushed *event* (carries
 * `event`, no transactionId).
 */
export interface HelperMessage {
    transactionId?: string;
    event?: string;
    data?: Record<string, unknown>;
    error?: string;
    /** The message GUID the dylib created — replaces fuzzy chat.db text-matching. */
    identifier?: string;
}
