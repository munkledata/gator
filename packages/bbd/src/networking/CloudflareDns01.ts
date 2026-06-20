import type { Logger } from "../core/logger";

/** Fetch shape (ok/status/json/text) — same as the DDNS client, injectable for tests. */
export type CfFetch = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>;

const CF_API = "https://api.cloudflare.com/client/v4";

/**
 * Manages the `_acme-challenge.<domain>` TXT record for the ACME dns-01 challenge via the
 * Cloudflare API — reusing the same token the DDNS feature already stores. dns-01 (rather
 * than http-01) means issuance works behind NAT with no inbound port 80, which is the
 * common home-server case for a Gator deployment.
 */
export class CloudflareDns01 {
    readonly #fetch: CfFetch;
    readonly #token: string;
    readonly #zone: string;
    readonly #logger?: Logger;
    #zoneIdCache: string | null = null;

    constructor(opts: { token: string; zone: string; fetch?: CfFetch; logger?: Logger }) {
        this.#token = opts.token;
        this.#zone = opts.zone;
        this.#fetch = opts.fetch ?? (globalThis.fetch as unknown as CfFetch);
        this.#logger = opts.logger?.child({ component: "cloudflare-dns01" });
    }

    /** Create the challenge TXT record; returns its record id for later cleanup. */
    async setChallenge(domain: string, value: string): Promise<string> {
        const zoneId = await this.#zoneId();
        const name = `_acme-challenge.${domain}`;
        // Remove any stale challenge records first (e.g. from an interrupted prior run).
        await this.#deleteExisting(zoneId, name);
        const body = JSON.stringify({ type: "TXT", name, content: value, ttl: 60 });
        const data = await this.#cf(`/zones/${zoneId}/dns_records`, { method: "POST", body });
        this.#logger?.debug(`set ${name} TXT`);
        return data.result.id as string;
    }

    async removeChallenge(recordId: string): Promise<void> {
        const zoneId = await this.#zoneId();
        try {
            await this.#cf(`/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
        } catch (e) {
            this.#logger?.debug(`failed to delete challenge record ${recordId}: ${(e as Error)?.message ?? e}`);
        }
    }

    async #deleteExisting(zoneId: string, name: string): Promise<void> {
        const data = await this.#cf(`/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`);
        for (const rec of data.result ?? []) {
            await this.#cf(`/zones/${zoneId}/dns_records/${rec.id}`, { method: "DELETE" }).catch(() => undefined);
        }
    }

    async #zoneId(): Promise<string> {
        if (this.#zoneIdCache) return this.#zoneIdCache;
        const zone = this.#zone.trim();
        if (!zone) throw new Error("ACME dns-01 needs a Cloudflare zone");
        const data = await this.#cf(`/zones?name=${encodeURIComponent(zone)}`);
        const id = data?.result?.[0]?.id;
        if (!id) throw new Error(`Cloudflare zone "${zone}" not found for this token`);
        this.#zoneIdCache = id;
        return id;
    }

    async #cf(path: string, init: { method?: string; body?: string } = {}): Promise<any> {
        const res = await this.#fetch(`${CF_API}${path}`, {
            method: init.method ?? "GET",
            headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" },
            body: init.body
        });
        let data: any = null;
        try {
            data = await res.json();
        } catch {
            /* non-JSON */
        }
        if (!res.ok || data?.success === false) {
            const msg = data?.errors?.[0]?.message ?? `HTTP ${res.status}`;
            throw new Error(`Cloudflare API ${path}: ${msg}`);
        }
        return data;
    }
}
