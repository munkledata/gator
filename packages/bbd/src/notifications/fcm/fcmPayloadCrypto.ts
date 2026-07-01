import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypt FCM data-payload bodies so push contents aren't visible to Google/FCM in transit
 * (the `encryptComs` setting). ONE-WAY: the server encrypts, the RN client decrypts with
 * expo-crypto's native AES-256-GCM using the SAME frame + key derivation.
 *
 * Scheme `AEAD_GCM_V1` (AES-256-GCM), chosen because both Node (`node:crypto`) and the RN
 * client (expo-crypto, native on Android) support it with zero extra deps:
 *   - key    = SHA-256(salt ‖ utf8(password))  → 32 bytes  (fresh per message via the salt,
 *              so a repeated GCM IV across messages can't collide under the same key)
 *   - frame  = version(1) ‖ salt(16) ‖ iv(12) ‖ tag(16) ‖ ciphertext, then base64
 *   - AAD    = none
 * `type` stays plaintext on the wire so the client routes the event before decrypting `data`.
 */

export const FCM_ENCRYPTION_TYPE = "AEAD_GCM_V1";

const VERSION = 0x01;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Derive the 32-byte AES-256 key from the server password + a per-message salt. */
function deriveKey(password: string, salt: Buffer): Buffer {
    return createHash("sha256")
        .update(Buffer.concat([salt, Buffer.from(password, "utf8")]))
        .digest();
}

/** Encrypt a JSON string → the base64 AEAD_GCM_V1 frame the RN client decrypts. */
export function encryptFcmPayload(plaintextJson: string, password: string): string {
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const key = deriveKey(password, salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
    const ciphertext = Buffer.concat([cipher.update(plaintextJson, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([VERSION]), salt, iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypt an AEAD_GCM_V1 frame. Not used in production (the server only encrypts) — it exists
 * so the unit test can prove the frame round-trips with a conformant AES-256-GCM impl, i.e.
 * that the RN/expo-crypto side can decrypt what the server produces.
 */
export function decryptFcmPayload(b64: string, password: string): string {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 1 + SALT_LEN + IV_LEN + TAG_LEN) throw new Error("frame too short");
    if (buf[0] !== VERSION) throw new Error(`unsupported frame version ${buf[0]}`);
    let o = 1;
    const salt = buf.subarray(o, (o += SALT_LEN));
    const iv = buf.subarray(o, (o += IV_LEN));
    const tag = buf.subarray(o, (o += TAG_LEN));
    const ciphertext = buf.subarray(o);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(password, salt), iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
