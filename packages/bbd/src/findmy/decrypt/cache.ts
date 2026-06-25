import { parsePlistBuffer } from "./plistUtils";

/**
 * Decrypts a Find My `.data` cache (FMIP / FMF) on macOS 14.4+. Ported from upstream PR #810.
 *
 * Apple's plists use the literal string "$null" as a null placeholder; the legacy plaintext cache
 * used real `null`s and the BlueBubbles clients expect nullable strings — so recursively replace
 * "$null" with null to match that shape.
 */
const normalizePlistNulls = (value: any): any => {
    if (value === "$null") return null;
    if (Array.isArray(value)) return value.map(normalizePlistNulls);
    if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
        for (const k of Object.keys(value)) {
            value[k] = normalizePlistNulls(value[k]);
        }
    }
    return value;
};

/**
 * Decrypts a Find My cache `.data` payload using ChaCha20-Poly1305.
 *
 * Layout of `encryptedData`: [ 12-byte nonce ][ ciphertext ][ 16-byte Poly1305 tag ].
 * The Poly1305 tag doubles as a correctness check — decryption throws on a wrong key, so a
 * successful decrypt implies the key is valid.
 *
 * @returns The decrypted plaintext buffer, or null on failure.
 */
export const decryptChaCha20Poly1305 = async (encryptedData: Buffer, key: Buffer): Promise<Buffer | null> => {
    if (encryptedData.length < 28) return null;

    // Dynamically import so a load-time failure of the module doesn't crash the daemon.
    const { chacha20poly1305 } = await import("@noble/ciphers/chacha");

    const nonce = encryptedData.subarray(0, 12);
    const ciphertextWithTag = encryptedData.subarray(12);

    const cipher = chacha20poly1305(new Uint8Array(key), new Uint8Array(nonce));
    const decrypted = cipher.decrypt(new Uint8Array(ciphertextWithTag));
    return Buffer.from(decrypted);
};

/**
 * Reads a Find My cache `.data` file (binary plist wrapper with an `encryptedData` blob), decrypts
 * it, and parses the resulting plaintext (typically another binary plist, occasionally JSON).
 *
 * @param fileBuffer Raw contents of the `.data` file
 * @param key 32-byte ChaCha20 key (FMIP or FMF)
 * @returns The parsed decrypted object, or null on failure.
 */
export const decryptCacheBuffer = async (fileBuffer: Buffer, key: Buffer): Promise<any | null> => {
    const wrapper = await parsePlistBuffer(fileBuffer);

    const encryptedData = wrapper?.encryptedData;
    if (!encryptedData) return null;

    const encryptedBuffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);
    const decrypted = await decryptChaCha20Poly1305(encryptedBuffer, key);
    if (!decrypted) return null;

    if (decrypted.toString("utf8", 0, 6) === "bplist") {
        return normalizePlistNulls(await parsePlistBuffer(decrypted));
    }

    try {
        return normalizePlistNulls(JSON.parse(decrypted.toString()));
    } catch {
        return null;
    }
};
