import { createHmac } from "node:crypto";
import type { Logger } from "../core/logger";

/**
 * Default SSRF guard for user-supplied webhook URLs (audit S3/S5): allow only http(s)
 * to a public host. Blocks loopback, RFC-1918/ULA private ranges, link-local, CGNAT,
 * multicast/reserved, and `localhost`/`*.local` — so a webhook can't be pointed at the
 * daemon's own admin API, a cloud metadata endpoint (169.254.169.254), or other
 * internal services. (Hostnames are checked syntactically; DNS-rebinding to a private
 * IP is out of scope for this static check.)
 */
export function isPublicHttpUrl(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;

    // IPv4 literal?
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 10 || a === 127 || a === 0) return false; // private / loopback / "this network"
        if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
        if (a === 192 && b === 168) return false; // 192.168/16
        if (a === 169 && b === 254) return false; // link-local (incl. cloud metadata)
        if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
        if (a >= 224) return false; // multicast / reserved
        return true;
    }
    // IPv6 literal?
    if (host.includes(":")) {
        if (host === "::1" || host === "::") return false; // loopback / unspecified
        if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return false; // link-local / ULA
        if (host.startsWith("::ffff:")) return false; // IPv4-mapped — reject to be safe
        return true;
    }
    return true; // a DNS name
}

export interface WebhookEvent {
    type: string;
    data: unknown;
}

export interface WebhookTarget {
    url: string;
    /** When set, the body is signed and sent as `X-BB-Signature: sha256=<hex>`. */
    secret?: string;
}

export type WebhookFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number }>;

export interface WebhookDispatcherOptions {
    logger: Logger;
    fetch?: WebhookFetch;
    maxRetries?: number;
    /** SSRF guard — return false to refuse a target URL. */
    allow?: (url: string) => boolean;
    /** Injected for testable backoff (defaults to setTimeout). */
    sleep?: (ms: number) => Promise<void>;
}

/**
 * Delivers webhooks with HMAC-SHA256 signing, retry/backoff, and an SSRF
 * allow-list — none of which the legacy `webhookService` has (it fires once,
 * unsigned, at any URL).
 */
export class WebhookDispatcher {
    readonly #logger: Logger;
    readonly #fetch: WebhookFetch;
    readonly #maxRetries: number;
    readonly #allow: (url: string) => boolean;
    readonly #sleep: (ms: number) => Promise<void>;

    constructor(opts: WebhookDispatcherOptions) {
        this.#logger = opts.logger.child({ component: "WebhookDispatcher" });
        this.#fetch = opts.fetch ?? (globalThis.fetch as unknown as WebhookFetch);
        this.#maxRetries = opts.maxRetries ?? 3;
        this.#allow = opts.allow ?? (() => true);
        this.#sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
    }

    sign(body: string, secret: string): string {
        return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    }

    async dispatch(target: WebhookTarget, event: WebhookEvent): Promise<boolean> {
        if (!this.#allow(target.url)) {
            this.#logger.warn(`refusing disallowed webhook target ${target.url}`);
            return false;
        }
        const body = JSON.stringify(event);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (target.secret) headers["X-BB-Signature"] = this.sign(body, target.secret);

        for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
            try {
                const res = await this.#fetch(target.url, { method: "POST", headers, body });
                if (res.ok) return true;
                this.#logger.debug(`webhook ${target.url} -> HTTP ${res.status} (attempt ${attempt + 1})`);
            } catch (e) {
                this.#logger.debug(`webhook ${target.url} failed (attempt ${attempt + 1})`, e);
            }
            if (attempt < this.#maxRetries) await this.#sleep(2 ** attempt * 250);
        }
        return false;
    }
}
