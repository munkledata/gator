import type { Logger } from "../core/logger";

/**
 * Cloudflare dynamic DNS.
 *
 * Keeps an `A` record (e.g. `bb.example.com`) pointed at the server's current public
 * IP, so a home/dynamic-IP server stays reachable on a custom domain. Detects the WAN
 * IP, looks up the zone + record via the Cloudflare API, and upserts only when the IP
 * actually changed. `fetch` is injected so the API + IP lookup are unit-testable.
 *
 * Default is DNS-only (grey-cloud, `proxied: false`): the record exposes the real IP so
 * clients can reach the server directly on its port — Cloudflare's HTTP proxy can't
 * forward the arbitrary port a BlueBubbles server listens on.
 */
export type DdnsFetch = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>;

export interface CloudflareDdnsSettings {
    enabled: boolean;
    apiToken: string;
    /** Full record name, e.g. `bb.example.com`. */
    record: string;
    /** Zone name, e.g. `example.com`. Derived from `record` (last two labels) if empty. */
    zone: string;
    proxied: boolean;
    intervalSeconds: number;
}

export interface DdnsSyncResult {
    ok: boolean;
    changed: boolean;
    ip?: string;
    previous?: string;
    record?: string;
    message: string;
}

const CF_API = "https://api.cloudflare.com/client/v4";
const MIN_INTERVAL_SECONDS = 60;

export class CloudflareDdns {
    readonly #fetch: DdnsFetch;
    readonly #getSettings: () => CloudflareDdnsSettings;
    readonly #logger?: Logger;
    #timer: ReturnType<typeof setTimeout> | null = null;
    #stopped = true;

    constructor(
        getSettings: () => CloudflareDdnsSettings,
        opts: { fetch?: DdnsFetch; logger?: Logger } = {}
    ) {
        this.#getSettings = getSettings;
        this.#fetch = opts.fetch ?? (globalThis.fetch as unknown as DdnsFetch);
        this.#logger = opts.logger?.child({ component: "cloudflare-ddns" });
    }

    /** Best-effort WAN IP: ipify first, Cloudflare's trace as a fallback. */
    async getPublicIp(): Promise<string> {
        try {
            const res = await this.#fetch("https://api.ipify.org?format=json");
            if (res.ok) {
                const data = await res.json();
                if (data?.ip) return String(data.ip).trim();
            }
        } catch {
            /* fall through to the trace endpoint */
        }
        const res = await this.#fetch("https://1.1.1.1/cdn-cgi/trace");
        const txt = await res.text();
        const m = txt.match(/^ip=(.+)$/m);
        if (m?.[1]) return m[1].trim();
        throw new Error("could not determine public IP");
    }

    /** Resolve, compare, and upsert once. Never throws — failures come back as `ok: false`. */
    async syncOnce(): Promise<DdnsSyncResult> {
        const s = this.#getSettings();
        if (!s.enabled) return { ok: true, changed: false, message: "Cloudflare DDNS is disabled" };
        if (!s.apiToken || !s.record) {
            return { ok: false, changed: false, message: "Cloudflare DDNS needs an API token and a record name" };
        }
        try {
            const ip = await this.getPublicIp();
            const zone = s.zone.trim() || s.record.split(".").slice(-2).join(".");
            const zoneId = await this.#zoneId(zone, s.apiToken);
            const rec = await this.#findRecord(zoneId, s.record, s.apiToken);

            if (rec && rec.content === ip) {
                return { ok: true, changed: false, ip, record: s.record, message: `${s.record} already points at ${ip}` };
            }
            const previous: string | undefined = rec?.content;
            await this.#upsert(zoneId, rec?.id ?? null, s.record, ip, s.proxied, s.apiToken);
            return {
                ok: true,
                changed: true,
                ip,
                previous,
                record: s.record,
                message: `${s.record} -> ${ip}${previous ? ` (was ${previous})` : ""}`
            };
        } catch (e) {
            return { ok: false, changed: false, message: (e as Error)?.message ?? String(e) };
        }
    }

    /** Sync now, then re-check on the configured interval. Reads settings fresh each tick. */
    start(): void {
        if (!this.#stopped) return;
        this.#stopped = false;
        const tick = async (): Promise<void> => {
            if (this.#stopped) return;
            const s = this.#getSettings();
            if (s.enabled && s.apiToken && s.record) {
                const r = await this.syncOnce();
                if (r.changed) this.#logger?.info(r.message);
                else if (!r.ok) this.#logger?.warn(r.message);
            }
            if (this.#stopped) return;
            const secs = Math.max(MIN_INTERVAL_SECONDS, this.#getSettings().intervalSeconds || 300);
            this.#timer = setTimeout(() => void tick(), secs * 1000);
        };
        void tick();
    }

    stop(): void {
        this.#stopped = true;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = null;
    }

    async #cf(path: string, token: string, init: { method?: string; body?: string } = {}): Promise<any> {
        const res = await this.#fetch(`${CF_API}${path}`, {
            method: init.method ?? "GET",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: init.body
        });
        let data: any = null;
        try {
            data = await res.json();
        } catch {
            /* non-JSON body */
        }
        if (!res.ok || data?.success === false) {
            const msg = data?.errors?.[0]?.message ?? `HTTP ${res.status}`;
            throw new Error(`Cloudflare API ${path}: ${msg}`);
        }
        return data;
    }

    async #zoneId(zone: string, token: string): Promise<string> {
        const data = await this.#cf(`/zones?name=${encodeURIComponent(zone)}`, token);
        const z = data?.result?.[0];
        if (!z?.id) throw new Error(`Cloudflare zone "${zone}" not found for this token`);
        return z.id;
    }

    async #findRecord(zoneId: string, name: string, token: string): Promise<{ id: string; content: string } | null> {
        const data = await this.#cf(`/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`, token);
        return data?.result?.[0] ?? null;
    }

    async #upsert(
        zoneId: string,
        recordId: string | null,
        name: string,
        ip: string,
        proxied: boolean,
        token: string
    ): Promise<void> {
        const body = JSON.stringify({ type: "A", name, content: ip, proxied, ttl: 1 });
        if (recordId) await this.#cf(`/zones/${zoneId}/dns_records/${recordId}`, token, { method: "PUT", body });
        else await this.#cf(`/zones/${zoneId}/dns_records`, token, { method: "POST", body });
    }
}
