import type { Config } from "./configSchema";

/**
 * Every plaintext credential held in the config blob. One canonical list so that all
 * config read paths strip the same secrets (audit S3/S7) — the REST `GET /api/v1/config`
 * and the admin-command `get-config` dispatcher previously disagreed, leaking the FCM
 * private key, Cloudflare token, VAPID key, etc. through the admin path.
 *
 * Both camelCase (typed schema keys) and snake_case (passthrough/legacy keys) names are
 * listed because the config object carries a mix of both.
 */
export const SECRET_TOP_LEVEL_KEYS: readonly string[] = [
    "password",
    "cloudflareDdnsApiToken",
    "cloudflare_ddns_api_token",
    "zrok_token"
];

const SECRET_KEY_SET = new Set(SECRET_TOP_LEVEL_KEYS);

/**
 * Return a copy of the config with every secret removed, safe to send to any client.
 * Strips the top-level credentials above plus the nested notification secrets
 * (`notifications.fcm.serviceAccount`, `notifications.fcm.oauthClientSecret`,
 * `notifications.webpush.vapidPrivateKey`).
 */
export function sanitizeConfig(config: Config): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
        if (k === "notifications" || SECRET_KEY_SET.has(k)) continue;
        out[k] = v;
    }

    const notifications = (config as { notifications?: Record<string, unknown> }).notifications;
    if (notifications) {
        const fcmIn = (notifications.fcm ?? {}) as Record<string, unknown>;
        const { serviceAccount, oauthClientSecret, ...fcm } = fcmIn;
        void serviceAccount;
        void oauthClientSecret;
        const webpushIn = (notifications.webpush ?? {}) as Record<string, unknown>;
        const { vapidPrivateKey, ...webpush } = webpushIn;
        void vapidPrivateKey;
        out.notifications = { ...notifications, fcm, webpush };
    }
    return out;
}
