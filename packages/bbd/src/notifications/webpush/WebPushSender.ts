import type { Logger } from "../../core/logger";
import type { WebPushTransport } from "../WebPushProvider";
import { encryptAes128gcm } from "./encrypt";
import { vapidAuthorization } from "./vapid";

export interface VapidConfig {
    publicKey: string;
    privateKey: string;
    subject: string;
}

export type WebPushFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: Uint8Array }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface WebPushSenderDeps {
    /** Live VAPID config accessor (null when keys aren't configured). */
    vapid: () => VapidConfig | null;
    logger: Logger;
    fetch?: WebPushFetch;
    /** Push TTL in seconds (how long the push service retains an undelivered message). */
    ttlSeconds?: number;
    /**
     * SSRF guard (audit F16): return false to refuse a subscription endpoint before it's
     * fetched. Defaults to allow-all (registration-time validation already restricts new
     * endpoints), but the daemon injects `isPublicHttpUrl` so an endpoint that slipped in
     * before the guard — or via another path — can never make the server fetch a private/
     * loopback/metadata host.
     */
    allow?: (url: string) => boolean;
}

/**
 * A real {@link WebPushTransport}: encrypts the payload (RFC 8291), signs the VAPID
 * Authorization header (RFC 8292), and POSTs the binary body to the subscription
 * endpoint. Replaces the inert stub — previously no transport was supplied, so Web Push
 * silently no-op'd even when enabled (audit "built but not mounted").
 */
export function createWebPushTransport(deps: WebPushSenderDeps): WebPushTransport {
    const fetch = deps.fetch ?? (globalThis.fetch as unknown as WebPushFetch);
    const ttl = String(deps.ttlSeconds ?? 2_419_200); // 4 weeks
    const allow = deps.allow ?? (() => true);
    const log = deps.logger.child({ component: "WebPushSender" });

    return async (subscription, body, opts) => {
        const vapid = deps.vapid();
        if (!vapid?.publicKey || !vapid?.privateKey) {
            throw new Error("Web Push is not configured (no VAPID keys) — generate them first");
        }

        // SSRF guard (audit F16): never fetch a non-public endpoint, even if a subscription
        // with one slipped past registration-time validation.
        if (!allow(subscription.endpoint)) {
            log.warn("refusing web push to a non-public endpoint");
            throw new Error("Web Push endpoint is not a public http(s) host");
        }

        const encrypted = encryptAes128gcm(Buffer.from(body, "utf8"), subscription.keys.p256dh, subscription.keys.auth);
        const authorization = vapidAuthorization({
            endpoint: subscription.endpoint,
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey
        });

        const res = await fetch(subscription.endpoint, {
            method: "POST",
            headers: {
                Authorization: authorization,
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                TTL: ttl,
                Urgency: opts.urgency === "high" ? "high" : "normal"
            },
            body: encrypted.body
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            // 404/410 mean the subscription is gone — the caller may want to prune it.
            log.debug(`web push -> HTTP ${res.status}`);
            throw new Error(`Web Push send failed: HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
        }
    };
}
