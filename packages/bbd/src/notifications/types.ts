/**
 * Notification domain types.
 *
 * Push is a per-device contract: a device registers with exactly one provider and
 * carries the registration data that provider needs. Modeling `Device` as a
 * discriminated union on `provider` is what lets the server stay provider-agnostic
 * — the legacy `devices` table only knew about FCM tokens.
 */

export type ProviderName = "fcm" | "webpush";

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

/**
 * Firebase Cloud Messaging — the default for the BlueBubbles app. The device's FCM
 * registration `token` is the send target; the server delivers via the FCM HTTP v1
 * API (service account → OAuth token → v1 endpoint), no `firebase-admin` SDK.
 */
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

export type Device = FcmDevice | WebPushDevice;
