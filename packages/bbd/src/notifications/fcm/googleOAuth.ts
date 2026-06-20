import { buildAuthorizationUrl, buildTokenExchangeBody } from "../../networking/oauthPkce";

/**
 * Google-specific layer over the shared {@link ../../networking/oauthPkce} helpers,
 * for the automatic Firebase setup. Uses the PKCE authorization-code flow so it works
 * with a user-registered "Desktop app" OAuth client (public, no secret, loopback
 * redirect). An optional client secret is supported for "Web application" clients.
 *
 * Fetch-injected so the token exchange unit-tests without real network.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Scopes needed to create a project, enable APIs, add Firebase, and mint a key. */
export const FIREBASE_SETUP_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
    "https://www.googleapis.com/auth/service.management"
];

export interface OAuthFetchResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
}
export type OAuthFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<OAuthFetchResponse>;

export interface GoogleAuthUrlParams {
    clientId: string;
    redirectUri: string;
    challenge: string;
    state: string;
    scopes?: string[];
}

/** Build the Google consent URL the user opens in their browser. */
export function buildGoogleAuthUrl(params: GoogleAuthUrlParams): string {
    const url = buildAuthorizationUrl({
        authorizationEndpoint: AUTH_ENDPOINT,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        scope: (params.scopes ?? FIREBASE_SETUP_SCOPES).join(" "),
        challenge: params.challenge,
        state: params.state
    });
    // Google extras: request a refresh token and always show the consent screen.
    return `${url}&access_type=offline&prompt=consent`;
}

export interface GoogleExchangeParams {
    code: string;
    verifier: string;
    clientId: string;
    redirectUri: string;
    /** Only "Web application" clients need a secret; Desktop clients omit it. */
    clientSecret?: string;
    fetch: OAuthFetch;
}

/** Exchange the authorization code for an access token. */
export async function exchangeCodeForToken(params: GoogleExchangeParams): Promise<string> {
    let body = buildTokenExchangeBody({
        tokenEndpoint: TOKEN_ENDPOINT,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        code: params.code,
        verifier: params.verifier
    });
    if (params.clientSecret) body += `&client_secret=${encodeURIComponent(params.clientSecret)}`;

    const res = await params.fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Google token exchange failed: HTTP ${res.status}${text ? `: ${text}` : ""}`);
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("Google token response missing access_token");
    return json.access_token;
}
