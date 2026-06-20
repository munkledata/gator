import { createSign } from "node:crypto";

/**
 * Signs a JWT signing-input (`base64url(header).base64url(claims)`) with an RS256
 * (RSA-SHA256) private key and returns the base64url signature. Injected into the
 * FCM provider so the unit tests can supply a deterministic fake instead of doing
 * real crypto — the same isolation discipline the other SDK seams use.
 */
export type JwtSigner = (signingInput: string, privateKeyPem: string) => string;

/** Production signer, built on node's `crypto`. No third-party JWT dependency. */
export const nodeRs256Signer: JwtSigner = (signingInput, privateKeyPem) => {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return signer.sign(privateKeyPem).toString("base64url");
};
