import fs from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import type { Logger } from "../core/logger";
import { AcmeClient, type AcmeFetch } from "./acme/AcmeClient";
import { generateAccountKeyPem, loadAccountKey } from "./acme/jws";
import { CloudflareDns01, type CfFetch } from "./CloudflareDns01";
import type { CertificateService, TlsMaterial } from "./CertificateService";

export interface AcmeSettings {
    /** True when tlsMode === "letsencrypt". */
    enabled: boolean;
    email: string;
    domain: string;
    directoryUrl: string;
    cloudflareToken: string;
    cloudflareZone: string;
    /** Renew this many days before expiry (default 30). */
    renewDaysBefore?: number;
    /** Seconds to wait for the TXT record to propagate before asking the CA to validate. */
    propagationSeconds?: number;
}

export interface AcmeServiceDeps {
    /** Directory holding the persisted ACME account key + issued cert/key. */
    certsDir: string;
    settings: () => AcmeSettings;
    cert: CertificateService;
    logger: Logger;
    /** ACME HTTP transport (default global fetch). */
    fetch?: AcmeFetch;
    /** Cloudflare HTTP transport (default global fetch). */
    cfFetch?: CfFetch;
    /** Injectable delay (tests pass a no-op). */
    sleep?: (ms: number) => Promise<void>;
    /** Called with fresh material after a (re)issue, so the TLS listener can hot-reload. */
    onCert?: (material: TlsMaterial) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Obtains and auto-renews a Let's Encrypt certificate using the dns-01 challenge over the
 * Cloudflare API (same token/zone as DDNS). Persists the ACME account key and the issued
 * cert/key under certsDir, renews ahead of expiry, and hot-reloads the running HTTPS
 * listener via {@link AcmeServiceDeps.onCert} so renewal needs no restart.
 */
export class AcmeService {
    readonly #deps: AcmeServiceDeps;
    readonly #fetch?: AcmeFetch;
    readonly #cfFetch?: CfFetch;
    readonly #sleep: (ms: number) => Promise<void>;
    readonly #logger: Logger;
    #timer: ReturnType<typeof setInterval> | null = null;

    constructor(deps: AcmeServiceDeps) {
        this.#deps = deps;
        this.#fetch = deps.fetch;
        this.#cfFetch = deps.cfFetch;
        this.#sleep = deps.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
        this.#logger = deps.logger.child({ component: "AcmeService" });
    }

    get #certPath(): string {
        return path.join(this.#deps.certsDir, "le-cert.pem");
    }
    get #keyPath(): string {
        return path.join(this.#deps.certsDir, "le-key.pem");
    }
    get #accountPath(): string {
        return path.join(this.#deps.certsDir, "acme-account.pem");
    }

    /** The currently-issued material, or null if none on disk. */
    currentMaterial(): TlsMaterial | null {
        if (!fs.existsSync(this.#certPath) || !fs.existsSync(this.#keyPath)) return null;
        return { cert: fs.readFileSync(this.#certPath, "utf8"), key: fs.readFileSync(this.#keyPath, "utf8") };
    }

    /** Expiry of the issued cert, or null if there is none / it can't be parsed. */
    expiry(): Date | null {
        const m = this.currentMaterial();
        if (!m) return null;
        try {
            return new Date(new X509Certificate(m.cert).validTo);
        } catch {
            return null;
        }
    }

    #needsIssue(): boolean {
        const exp = this.expiry();
        if (!exp) return true;
        const renewBefore = (this.#deps.settings().renewDaysBefore ?? 30) * DAY_MS;
        return exp.getTime() - Date.now() <= renewBefore;
    }

    #accountKey() {
        if (!fs.existsSync(this.#accountPath)) {
            fs.mkdirSync(this.#deps.certsDir, { recursive: true });
            fs.writeFileSync(this.#accountPath, generateAccountKeyPem(), { mode: 0o600 });
        }
        return loadAccountKey(fs.readFileSync(this.#accountPath, "utf8"));
    }

    /** Return existing material if still valid, otherwise issue a new certificate. */
    async ensure(): Promise<TlsMaterial> {
        if (!this.#needsIssue()) return this.currentMaterial()!;
        return this.issue();
    }

    /** Run the full ACME dns-01 flow and persist the resulting cert/key. */
    async issue(): Promise<TlsMaterial> {
        const s = this.#deps.settings();
        if (!s.email) throw new Error("Let's Encrypt needs an account email");
        if (!s.domain) throw new Error("Let's Encrypt needs a domain");
        if (!s.cloudflareToken || !s.cloudflareZone) {
            throw new Error("Let's Encrypt (dns-01) needs a Cloudflare API token and zone");
        }

        this.#logger.info(`requesting a Let's Encrypt certificate for ${s.domain}`);
        const client = new AcmeClient({
            fetch: this.#fetch ?? (globalThis.fetch as unknown as AcmeFetch),
            accountKey: this.#accountKey(),
            directoryUrl: s.directoryUrl
        });
        const dns = new CloudflareDns01({
            token: s.cloudflareToken,
            zone: s.cloudflareZone,
            fetch: this.#cfFetch,
            logger: this.#logger
        });

        await client.registerAccount(s.email);
        const order = await client.newOrder([s.domain]);

        for (const authzUrl of order.authorizations) {
            const { challenge, domain } = await client.getDns01Challenge(authzUrl);
            const value = client.dns01Value(challenge.token);
            const recordId = await dns.setChallenge(domain || s.domain, value);
            try {
                await this.#sleep((s.propagationSeconds ?? 20) * 1000);
                await client.submitChallenge(challenge.url);
                const result = await client.pollStatus(authzUrl, { sleep: this.#sleep });
                if (result.status !== "valid") throw new Error(`authorization for ${domain} is ${result.status}`);
            } finally {
                await dns.removeChallenge(recordId);
            }
        }

        const { keyPem, csrDerB64Url } = await this.#deps.cert.generateKeyAndCsr(s.domain);
        await client.finalize(order.finalize, csrDerB64Url);
        const finalOrder = await client.pollStatus(order.url, { sleep: this.#sleep });
        if (finalOrder.status !== "valid" || !finalOrder.certificate) {
            throw new Error(`ACME order did not become valid (status ${finalOrder.status})`);
        }
        const certPem = await client.downloadCertificate(finalOrder.certificate);

        fs.mkdirSync(this.#deps.certsDir, { recursive: true });
        fs.writeFileSync(this.#keyPath, keyPem, { mode: 0o600 });
        fs.writeFileSync(this.#certPath, certPem, { mode: 0o600 });
        this.#logger.info(`Let's Encrypt certificate issued for ${s.domain}`);
        const material = { key: keyPem, cert: certPem };
        this.#deps.onCert?.(material);
        return material;
    }

    /** Start a daily renewal check; reissues + hot-reloads when within the renew window. */
    startRenewal(intervalMs = 12 * 60 * 60 * 1000): void {
        if (this.#timer) return;
        this.#timer = setInterval(() => {
            if (!this.#deps.settings().enabled) return;
            if (!this.#needsIssue()) return;
            this.#logger.info("certificate within the renewal window; renewing");
            void this.issue().catch(e => this.#logger.warn(`renewal failed: ${(e as Error)?.message ?? e}`));
        }, intervalMs);
        // Don't keep the event loop alive solely for the renewal timer.
        (this.#timer as { unref?: () => void }).unref?.();
    }

    stop(): void {
        if (this.#timer) clearInterval(this.#timer);
        this.#timer = null;
    }
}
