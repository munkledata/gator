import type { KeyObject } from "node:crypto";
import { signJws, publicJwk, jwkThumbprint, dns01TxtValue, type EcJwk } from "./jws";

/** A fetch that exposes response headers (ACME needs Replay-Nonce / Location). */
export type AcmeFetch = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    json(): Promise<any>;
    text(): Promise<string>;
}>;

export interface AcmeDirectory {
    newNonce: string;
    newAccount: string;
    newOrder: string;
}

export interface AcmeChallenge {
    type: string;
    url: string;
    token: string;
    status: string;
}

export interface AcmeOrder {
    url: string;
    status: string;
    authorizations: string[];
    finalize: string;
    certificate?: string;
}

/** Let's Encrypt production + staging directory URLs. */
export const LETS_ENCRYPT_PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory";
export const LETS_ENCRYPT_STAGING = "https://acme-staging-v02.api.letsencrypt.org/directory";

/**
 * A small ACME (RFC 8555) client: directory + nonce handling, account registration,
 * order creation, dns-01 authorization, finalize, and certificate download. All HTTP is
 * through an injected fetch so the full flow is unit-testable without a real CA.
 */
export class AcmeClient {
    readonly #fetch: AcmeFetch;
    readonly #key: KeyObject;
    readonly #jwk: EcJwk;
    readonly #directoryUrl: string;
    #directory: AcmeDirectory | null = null;
    #nonce: string | null = null;
    #kid: string | null = null;

    constructor(opts: { fetch: AcmeFetch; accountKey: KeyObject; directoryUrl: string }) {
        this.#fetch = opts.fetch;
        this.#key = opts.accountKey;
        this.#jwk = publicJwk(opts.accountKey);
        this.#directoryUrl = opts.directoryUrl;
    }

    /** The account's JWK thumbprint, for building dns-01 TXT values. */
    thumbprint(): string {
        return jwkThumbprint(this.#jwk);
    }

    dns01Value(token: string): string {
        return dns01TxtValue(token, this.thumbprint());
    }

    async #dir(): Promise<AcmeDirectory> {
        if (this.#directory) return this.#directory;
        const res = await this.#fetch(this.#directoryUrl);
        if (!res.ok) throw new Error(`ACME directory fetch failed: HTTP ${res.status}`);
        this.#directory = (await res.json()) as AcmeDirectory;
        return this.#directory;
    }

    async #freshNonce(): Promise<string> {
        if (this.#nonce) {
            const n = this.#nonce;
            this.#nonce = null;
            return n;
        }
        const dir = await this.#dir();
        const res = await this.#fetch(dir.newNonce, { method: "HEAD" });
        const nonce = res.headers.get("replay-nonce");
        if (!nonce) throw new Error("ACME newNonce returned no Replay-Nonce");
        return nonce;
    }

    /** Signed POST (or POST-as-GET when payload === ""), with one retry on a bad-nonce error. */
    async #post(url: string, payload: unknown, useJwk = false): Promise<{ status: number; body: any; location: string | null }> {
        for (let attempt = 0; attempt < 2; attempt++) {
            const nonce = await this.#freshNonce();
            const jws = signJws({
                key: this.#key,
                url,
                nonce,
                payload,
                ...(useJwk ? { jwk: this.#jwk } : { kid: this.#kid ?? undefined })
            });
            const res = await this.#fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/jose+json" },
                body: JSON.stringify(jws)
            });
            const next = res.headers.get("replay-nonce");
            if (next) this.#nonce = next;

            let body: any = null;
            const text = await res.text();
            try {
                body = text ? JSON.parse(text) : null;
            } catch {
                body = text; // PEM cert chain etc.
            }
            if (!res.ok && body?.type === "urn:ietf:params:acme:error:badNonce" && attempt === 0) {
                continue; // retry once with a fresh nonce
            }
            if (!res.ok) {
                const detail = body?.detail ?? (typeof body === "string" ? body : `HTTP ${res.status}`);
                throw new Error(`ACME POST ${url} failed: ${detail}`);
            }
            return { status: res.status, body, location: res.headers.get("location") };
        }
        throw new Error(`ACME POST ${url} failed after nonce retry`);
    }

    /** Register (or recover) the account; stores the kid for subsequent requests. */
    async registerAccount(email: string): Promise<string> {
        const dir = await this.#dir();
        const res = await this.#post(dir.newAccount, { termsOfServiceAgreed: true, contact: [`mailto:${email}`] }, true);
        if (!res.location) throw new Error("ACME newAccount returned no account URL");
        this.#kid = res.location;
        return res.location;
    }

    async newOrder(domains: string[]): Promise<AcmeOrder> {
        const dir = await this.#dir();
        const res = await this.#post(dir.newOrder, { identifiers: domains.map(value => ({ type: "dns", value })) });
        if (!res.location) throw new Error("ACME newOrder returned no order URL");
        return { url: res.location, ...res.body } as AcmeOrder;
    }

    /** Fetch an authorization and return its dns-01 challenge (throws if none offered). */
    async getDns01Challenge(authzUrl: string): Promise<{ challenge: AcmeChallenge; domain: string }> {
        const res = await this.#post(authzUrl, "");
        const challenge = (res.body.challenges as AcmeChallenge[]).find(c => c.type === "dns-01");
        if (!challenge) throw new Error(`no dns-01 challenge for ${authzUrl}`);
        return { challenge, domain: res.body.identifier?.value ?? "" };
    }

    /** Tell the CA the challenge is ready to be validated. */
    async submitChallenge(challengeUrl: string): Promise<void> {
        await this.#post(challengeUrl, {});
    }

    /** Poll a resource (authz/order) until it leaves "pending"/"processing" or times out. */
    async pollStatus(url: string, opts: { attempts?: number; sleepMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<any> {
        const attempts = opts.attempts ?? 20;
        const sleepMs = opts.sleepMs ?? 3000;
        const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
        for (let i = 0; i < attempts; i++) {
            const res = await this.#post(url, "");
            const status = res.body?.status;
            if (status && status !== "pending" && status !== "processing") return res.body;
            await sleep(sleepMs);
        }
        throw new Error(`ACME polling timed out for ${url}`);
    }

    /** Finalize the order with a base64url DER CSR; returns the order with a certificate URL. */
    async finalize(finalizeUrl: string, csrDerB64Url: string): Promise<any> {
        const res = await this.#post(finalizeUrl, { csr: csrDerB64Url });
        return res.body;
    }

    /** Download the issued PEM certificate chain. */
    async downloadCertificate(certUrl: string): Promise<string> {
        const res = await this.#post(certUrl, "");
        return typeof res.body === "string" ? res.body : await Promise.resolve(String(res.body));
    }
}
