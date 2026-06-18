/**
 * Notification domain types.
 *
 * Push is a per-device contract: a device registers with exactly one provider and
 * carries the registration data that provider needs. Modeling `Device` as a
 * discriminated union on `provider` is what lets the server stay provider-agnostic
 * — the legacy `devices` table only knew about FCM tokens.
 */

export type ProviderName = "unifiedpush" | "fcm" | "webpush";

/** A normalized, already-serialized notification ready for any provider. */
export interface NotificationPayload {
    /** Frozen wire event type, e.g. "new-message". */
    type: string;
    /** Already-serialized event data. */
    data: unknown;
    priority: "normal" | "high";
}

interface DeviceBase {
    id: string;
    name: string;
    createdAt: number;
    lastActiveAt?: number;
}

/** UnifiedPush (e.g. ntfy/Gotify) — the default. The server just POSTs to `endpoint`. */
export interface UnifiedPushDevice extends DeviceBase {
    provider: "unifiedpush";
    endpoint: string;
}

/** Firebase Cloud Messaging (HTTP v1). */
export interface FcmDevice extends DeviceBase {
    provider: "fcm";
    token: string;
}

/** Web Push (VAPID) for browser/PWA/desktop clients. */
export interface WebPushDevice extends DeviceBase {
    provider: "webpush";
    subscription: WebPushSubscription;
}

export interface WebPushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export type Device = UnifiedPushDevice | FcmDevice | WebPushDevice;
