import { generateKeyPairSync, createPublicKey, createPrivateKey, createHash, sign, type KeyObject } from "node:crypto";

/**
 * The minimal JOSE primitives an ACME (RFC 8555) client needs, on node:crypto only —
 * no jose/acme-client dependency (matching how the FCM JWT signer is hand-rolled).
 * Account keys are EC P-256 (ES256): small, fast, and the LE-preferred curve.
 */

export interface EcJwk {
    kty: "EC";
    crv: string;
    x: string;
    y: string;
}

const b64url = (buf: Buffer | string): string =>
    (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString("base64url");

/** Generate a fresh ACME account key; returned as a PEM to persist and reuse. */
export function generateAccountKeyPem(): string {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

export function loadAccountKey(pem: string): KeyObject {
    return createPrivateKey(pem);
}

/** The public JWK ({kty,crv,x,y}) for the account's protected header / thumbprint. */
export function publicJwk(privateKey: KeyObject): EcJwk {
    const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as Record<string, string>;
    return { kty: "EC", crv: jwk.crv!, x: jwk.x!, y: jwk.y! };
}

/**
 * RFC 7638 JWK thumbprint: SHA-256 over the canonical JSON of the required members in
 * lexicographic order (crv, kty, x, y for EC), base64url-encoded. Used to build the
 * dns-01 key authorization.
 */
export function jwkThumbprint(jwk: EcJwk): string {
    const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
    return b64url(createHash("sha256").update(canonical).digest());
}

export interface FlattenedJws {
    protected: string;
    payload: string;
    signature: string;
}

export interface SignJwsArgs {
    key: KeyObject;
    url: string;
    nonce: string;
    /** ACME account URL once registered; omit on the newAccount request (uses jwk instead). */
    kid?: string;
    /** The public JWK, required when kid is absent (newAccount / key rollover). */
    jwk?: EcJwk;
    /** The request body; `""` produces a POST-as-GET (empty payload). */
    payload?: unknown;
}

/** Produce a flattened-JSON ES256 JWS for an ACME request. */
export function signJws(args: SignJwsArgs): FlattenedJws {
    const header: Record<string, unknown> = { alg: "ES256", nonce: args.nonce, url: args.url };
    if (args.kid) header.kid = args.kid;
    else if (args.jwk) header.jwk = args.jwk;
    else throw new Error("signJws requires either kid or jwk");

    const protectedB64 = b64url(JSON.stringify(header));
    const payloadB64 = args.payload === "" || args.payload === undefined ? "" : b64url(JSON.stringify(args.payload));
    const signingInput = `${protectedB64}.${payloadB64}`;
    // ACME wants raw R||S (IEEE P1363), not the DER ECDSA signature Node defaults to.
    const sig = sign("sha256", Buffer.from(signingInput), { key: args.key, dsaEncoding: "ieee-p1363" });
    return { protected: protectedB64, payload: payloadB64, signature: b64url(sig) };
}

/** The dns-01 TXT value for a challenge token: base64url(sha256(token + "." + thumbprint)). */
export function dns01TxtValue(token: string, thumbprint: string): string {
    return b64url(createHash("sha256").update(`${token}.${thumbprint}`).digest());
}

export { b64url };
