import { type Result, ok, err, toError } from "../core/result";
import type { NotificationProvider } from "./NotificationProvider";
import type { FcmDevice, NotificationPayload } from "./types";
import type { FcmServiceAccount } from "./fcm/serviceAccount";
import type { JwtSigner } from "./fcm/sign";

/**
 * Firebase Cloud Messaging over the **HTTP v1 API** — fully self-contained, no
 * `firebase-admin` dependency.
 *
 * The legacy server-key API Google shut down in July 2024 is gone; v1 requires an
 * OAuth2 bearer token minted from the service account. So sending is two hops:
 *   1. sign a short-lived JWT with the service-account private key and exchange it
 *      at Google's token endpoint for an access token (cached until it nears expiry);
 *   2. POST a data-only message to `…/v1/projects/{projectId}/messages:send`.
 *
 * Credentials are read through a live accessor, so configuring FCM after boot takes
 * effect without restarting the daemon; the cached token is invalidated whenever the
 * service-account identity changes. The data-only `{ type, data }` shape is preserved
 * for wire-compat with existing BlueBubbles clients.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const sendUrl = (projectId: string): string => `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

/** Refresh the access token this far before its stated expiry, to avoid edge races. */
const EXPIRY_SKEW_MS = 60_000;

/** Minimal `fetch` shape, declared locally so the package needs no DOM lib types. */
export interface FcmResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
}
export type FcmFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string }
) => Promise<FcmResponse>;

export interface FcmProviderDeps {
    /** Live accessor for the configured service account (null when FCM is unconfigured). */
    credentials: () => FcmServiceAccount | null;
    fetch: FcmFetch;
    sign: JwtSigner;
    now?: () => number;
    /**
     * Optional live payload encryptor (honors the `encryptComs` setting). When it returns a
     * value, the `data` body is shipped encrypted with `encrypted:'true'` + `encryptionType`;
     * returning null (encryptComs off / no password) sends plaintext. `type` is never
     * encrypted so the client can route the event before decrypting.
     */
    encryptData?: (plaintextJson: string) => { data: string; encryptionType: string } | null;
}

interface CachedToken {
    token: string;
    expiresAt: number;
    /** The identity the token was minted for; a change invalidates the cache. */
    clientEmail: string;
}

const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64url");

export class FcmProvider implements NotificationProvider<FcmDevice> {
    readonly name = "fcm" as const;
    readonly #deps: FcmProviderDeps;
    #cache: CachedToken | null = null;

    constructor(deps: FcmProviderDeps) {
        this.#deps = deps;
    }

    async send(device: FcmDevice, payload: NotificationPayload): Promise<Result<void, Error>> {
        try {
            const creds = this.#deps.credentials();
            if (!creds) return err(new Error("FCM is not configured (no service account)"));

            const accessToken = await this.#accessToken(creds);
            // Data-only message (legacy wire shape); all values must be strings. `type` stays
            // plaintext for client-side routing; the `data` body is encrypted when encryptComs
            // is on (the encryptor returns null otherwise → plaintext).
            const bodyJson = JSON.stringify(payload.data);
            const enc = this.#deps.encryptData?.(bodyJson) ?? null;
            const data: Record<string, string> = enc
                ? { type: payload.type, data: enc.data, encrypted: "true", encryptionType: enc.encryptionType }
                : { type: payload.type, data: bodyJson };
            const res = await this.#deps.fetch(sendUrl(creds.projectId), {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: {
                        token: device.token,
                        data,
                        android: { priority: payload.priority === "high" ? "high" : "normal" }
                    }
                })
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                return err(new Error(`FCM send returned HTTP ${res.status}${body ? `: ${body}` : ""}`));
            }
            return ok(undefined);
        } catch (e) {
            return err(toError(e));
        }
    }

    /** Return a valid OAuth access token, minting (and caching) a new one if needed. */
    async #accessToken(creds: FcmServiceAccount): Promise<string> {
        const now = (this.#deps.now ?? Date.now)();
        if (this.#cache && this.#cache.clientEmail === creds.clientEmail && this.#cache.expiresAt - EXPIRY_SKEW_MS > now) {
            return this.#cache.token;
        }

        const iat = Math.floor(now / 1000);
        const claims = { iss: creds.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
        const signingInput = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
        const assertion = `${signingInput}.${this.#deps.sign(signingInput, creds.privateKey)}`;

        const res = await this.#deps.fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }).toString()
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Google OAuth token request failed: HTTP ${res.status}${body ? `: ${body}` : ""}`);
        }
        const json = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!json.access_token) throw new Error("Google OAuth token response missing access_token");

        this.#cache = {
            token: json.access_token,
            expiresAt: now + (json.expires_in ?? 3600) * 1000,
            clientEmail: creds.clientEmail
        };
        return json.access_token;
    }
}
