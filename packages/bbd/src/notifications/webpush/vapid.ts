import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from "node:crypto";

/**
 * VAPID (Voluntary Application Server Identification, RFC 8292) for Web Push.
 *
 * Keys are EC P-256 in the conventional web-push wire format: the public key is the
 * base64url uncompressed point (also the browser's `applicationServerKey`), the private
 * key is the base64url 32-byte scalar `d`. Signing rebuilds a KeyObject from those via
 * JWK, so keys generated here (or pasted from `web-push generate-vapid-keys`) both work.
 */

const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64url");

export interface VapidKeys {
    /** base64url uncompressed P-256 point — give this to the browser. */
    publicKey: string;
    /** base64url 32-byte private scalar — secret. */
    privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pj = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const dj = privateKey.export({ format: "jwk" }) as { d: string };
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, "base64url"), Buffer.from(pj.y, "base64url")]);
    return { publicKey: point.toString("base64url"), privateKey: dj.d };
}

/** Rebuild a signing KeyObject from the web-push-format VAPID keypair. */
function signingKey(publicKeyB64: string, privateKeyB64: string) {
    const pub = Buffer.from(publicKeyB64, "base64url"); // 0x04 | X(32) | Y(32)
    if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key must be a base64url uncompressed P-256 point");
    return createPrivateKey({
        key: {
            kty: "EC",
            crv: "P-256",
            d: privateKeyB64,
            x: pub.subarray(1, 33).toString("base64url"),
            y: pub.subarray(33, 65).toString("base64url")
        },
        format: "jwk"
    });
}

export interface VapidAuthArgs {
    /** The push subscription endpoint (its origin becomes the JWT `aud`). */
    endpoint: string;
    /** Contact `sub` claim — a `mailto:` or `https:` URI. */
    subject: string;
    publicKey: string;
    privateKey: string;
    /** Token lifetime in seconds (RFC 8292 caps it at 24h); default 12h. */
    expiresInSeconds?: number;
    now?: () => number;
}

/** Build the `Authorization: vapid t=<jwt>, k=<pubkey>` header value. */
export function vapidAuthorization(args: VapidAuthArgs): string {
    const aud = new URL(args.endpoint).origin;
    const sub = args.subject || "mailto:admin@localhost";
    const exp = Math.floor((args.now?.() ?? Date.now()) / 1000) + (args.expiresInSeconds ?? 12 * 60 * 60);

    const signingInput = `${b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${b64url(JSON.stringify({ aud, exp, sub }))}`;
    const key = signingKey(args.publicKey, args.privateKey);
    const sig = cryptoSign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
    return `vapid t=${signingInput}.${sig}, k=${args.publicKey}`;
}
