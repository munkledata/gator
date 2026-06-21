import { createECDH, createHmac, createCipheriv, randomBytes } from "node:crypto";

/**
 * Web Push message encryption — RFC 8291 (aes128gcm content encoding, RFC 8188).
 *
 * Hand-rolled on node:crypto (no `web-push` dependency, matching the FCM sender) so the
 * server can encrypt a payload for a browser PushSubscription using its public key
 * (`p256dh`) and `auth` secret. The ephemeral server key + salt are injectable so the
 * RFC 8291 §5 test vector can be reproduced exactly.
 */

const hmac = (key: Buffer, data: Buffer): Buffer => createHmac("sha256", key).update(data).digest();
const info = (label: string): Buffer => Buffer.from(label, "utf8"); // labels include their trailing NUL

export interface EncryptResult {
    /** The full aes128gcm body: header (salt|rs|idlen|keyid) + encrypted record. */
    body: Buffer;
    salt: Buffer;
    serverPublicKey: Buffer;
    /** Derived content-encryption key / nonce — exposed for test-vector verification. */
    cek: Buffer;
    nonce: Buffer;
}

export interface EncryptOptions {
    /** Ephemeral server EC private key (32-byte scalar). Random if omitted. */
    serverPrivateKey?: Buffer;
    /** 16-byte salt. Random if omitted. */
    salt?: Buffer;
    /** Record size (RFC 8188). Default 4096 — the Web Push max. */
    recordSize?: number;
}

export function encryptAes128gcm(plaintext: Buffer, p256dhB64: string, authB64: string, opts: EncryptOptions = {}): EncryptResult {
    const uaPublic = Buffer.from(p256dhB64, "base64url"); // receiver public key (65-byte point)
    const authSecret = Buffer.from(authB64, "base64url"); // 16-byte auth secret
    const salt = opts.salt ?? randomBytes(16);
    const rs = opts.recordSize ?? 4096;

    // Ephemeral server (application server) keypair.
    const ecdh = createECDH("prime256v1");
    if (opts.serverPrivateKey) ecdh.setPrivateKey(opts.serverPrivateKey);
    else ecdh.generateKeys();
    const asPublic = ecdh.getPublicKey(); // 65-byte uncompressed point
    const ecdhSecret = ecdh.computeSecret(uaPublic); // 32 bytes

    // RFC 8291 §3.4 keying: combine auth_secret with the ECDH secret, bound to both keys.
    const prkKey = hmac(authSecret, ecdhSecret); // HKDF-Extract(salt=auth, ikm=ecdh)
    const keyInfo = Buffer.concat([info("WebPush: info\0"), uaPublic, asPublic]);
    const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])])).subarray(0, 32); // HKDF-Expand, L=32

    // RFC 8188 content-encryption keying with the salt.
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.concat([info("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
    const nonce = hmac(prk, Buffer.concat([info("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);

    // Single record: plaintext + last-record delimiter (0x02), then AES-128-GCM.
    const record = Buffer.concat([plaintext, Buffer.from([2])]);
    if (record.length + 16 > rs) {
        throw new Error(`Web Push payload too large for a single ${rs}-byte record`);
    }
    const cipher = createCipheriv("aes-128-gcm", cek, nonce);
    const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

    // RFC 8188 §2.1 header: salt(16) | rs(4, BE) | idlen(1) | keyid(=as_public).
    const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
    salt.copy(header, 0);
    header.writeUInt32BE(rs, 16);
    header.writeUInt8(asPublic.length, 20);
    asPublic.copy(header, 21);

    return { body: Buffer.concat([header, encrypted]), salt, serverPublicKey: asPublic, cek, nonce };
}
