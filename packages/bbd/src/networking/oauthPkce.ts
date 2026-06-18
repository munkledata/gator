import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth Authorization-Code + PKCE helpers.
 *
 * Replaces the legacy 882-line implicit-token flow that scraped a token out of an
 * Electron BrowserWindow. PKCE uses the system browser and a redirect, needs no
 * client secret, and is the modern standard for native apps.
 */

export interface PkcePair {
    /** High-entropy secret kept by the client. */
    verifier: string;
    /** SHA-256(verifier), base64url — sent in the authorization request. */
    challenge: string;
}

function base64url(buffer: Buffer): string {
    return buffer.toString("base64url");
}

export function generatePkce(): PkcePair {
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    return { verifier, challenge };
}

export interface AuthorizationRequest {
    authorizationEndpoint: string;
    clientId: string;
    redirectUri: string;
    scope: string;
    challenge: string;
    state: string;
}

export function buildAuthorizationUrl(req: AuthorizationRequest): string {
    const url = new URL(req.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", req.clientId);
    url.searchParams.set("redirect_uri", req.redirectUri);
    url.searchParams.set("scope", req.scope);
    url.searchParams.set("state", req.state);
    url.searchParams.set("code_challenge", req.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
}

export interface TokenExchangeRequest {
    tokenEndpoint: string;
    clientId: string;
    redirectUri: string;
    code: string;
    verifier: string;
}

/** The form body for exchanging an authorization code + verifier for tokens. */
export function buildTokenExchangeBody(req: TokenExchangeRequest): string {
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: req.clientId,
        redirect_uri: req.redirectUri,
        code: req.code,
        code_verifier: req.verifier
    });
    return params.toString();
}
