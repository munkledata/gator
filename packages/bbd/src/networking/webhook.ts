import { createHmac } from "node:crypto";
import type { Logger } from "../core/logger";

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
