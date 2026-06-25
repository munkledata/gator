import fs from "node:fs";
import path from "node:path";
import { parsePlistFile, extractSymmetricKey } from "./decrypt/plistUtils";
import { FIND_MY_KEYS_DIR } from "./paths";

export type FindMyKeyType = "LocalStorage" | "FMIP" | "FMF";

/** Canonical file names for each key, as produced by findmy-key-extractor. */
export const FIND_MY_KEY_FILES: Record<FindMyKeyType, string> = {
    LocalStorage: "LocalStorage.key",
    FMIP: "FMIPDataManager.bplist",
    FMF: "FMFDataManager.bplist"
};

export type FindMyKeyStatus = {
    /** The key file exists in the BlueBubbles keys directory. */
    present: boolean;
    /** The key file is well-formed (correct length / parseable). */
    valid: boolean;
};
export type FindMyKeysStatus = Record<FindMyKeyType, FindMyKeyStatus>;
export type KeyImportResult = "imported" | "invalid" | "missing";

/**
 * Loads, validates, caches, and imports the three Find My decryption keys. Ported/adapted from
 * upstream PR #810 (no `Server()`/`FileSystem` singletons — reads from {@link FIND_MY_KEYS_DIR}).
 *
 * Keys are derived from the user's iCloud account and are stable across reboots, so they only need
 * to be imported once (via the Gator settings UI).
 */
export class FindMyKeyManager {
    private static cache: Partial<Record<FindMyKeyType, Buffer>> = {};

    private static keyPath(type: FindMyKeyType): string {
        return path.join(FIND_MY_KEYS_DIR, FIND_MY_KEY_FILES[type]);
    }

    /** Clears the in-memory key cache (call after a re-import). */
    static clearCache(): void {
        this.cache = {};
    }

    /** The 32-byte LocalStorage key (raw bytes), or null if unavailable/invalid. */
    static loadLocalStorageKey(): Buffer | null {
        if (this.cache.LocalStorage) return this.cache.LocalStorage;

        const keyPath = this.keyPath("LocalStorage");
        if (!fs.existsSync(keyPath)) return null;

        const key = fs.readFileSync(keyPath);
        if (key.length !== 32) return null;

        this.cache.LocalStorage = key;
        return key;
    }

    /** A 32-byte ChaCha20 cache key (FMIP or FMF), or null if unavailable/invalid. */
    static async loadCacheKey(type: "FMIP" | "FMF"): Promise<Buffer | null> {
        if (this.cache[type]) return this.cache[type] as Buffer;

        const keyPath = this.keyPath(type);
        if (!fs.existsSync(keyPath)) return null;

        try {
            const plistData = await parsePlistFile(keyPath);
            const key = extractSymmetricKey(plistData);
            if (!key) return null;
            this.cache[type] = key;
            return key;
        } catch {
            return null;
        }
    }

    /** Presence/validity for all three keys (for the settings status card). */
    static async getStatus(): Promise<FindMyKeysStatus> {
        const lsPath = this.keyPath("LocalStorage");
        const lsPresent = fs.existsSync(lsPath);
        const status = {
            LocalStorage: { present: lsPresent, valid: lsPresent && this.loadLocalStorageKey() != null }
        } as FindMyKeysStatus;

        for (const type of ["FMIP", "FMF"] as const) {
            const present = fs.existsSync(this.keyPath(type));
            status[type] = { present, valid: present && (await this.loadCacheKey(type)) != null };
        }

        return status;
    }

    private static async isValidKeyFile(type: FindMyKeyType, filePath: string): Promise<boolean> {
        if (type === "LocalStorage") return fs.readFileSync(filePath).length === 32;
        try {
            return extractSymmetricKey(await parsePlistFile(filePath)) != null;
        } catch {
            return false;
        }
    }

    /**
     * Import the three keys from a source directory (the findmy-key-extractor output). Each is
     * validated before being copied (0600) into {@link FIND_MY_KEYS_DIR}.
     */
    static async importFromDir(sourceDir: string): Promise<Record<FindMyKeyType, KeyImportResult>> {
        if (!fs.existsSync(FIND_MY_KEYS_DIR)) {
            fs.mkdirSync(FIND_MY_KEYS_DIR, { recursive: true, mode: 0o700 });
        }

        const result = {} as Record<FindMyKeyType, KeyImportResult>;
        for (const type of ["LocalStorage", "FMIP", "FMF"] as const) {
            const src = path.join(sourceDir, FIND_MY_KEY_FILES[type]);
            if (!fs.existsSync(src)) {
                result[type] = "missing";
                continue;
            }
            if (!(await this.isValidKeyFile(type, src))) {
                result[type] = "invalid";
                continue;
            }
            fs.copyFileSync(src, this.keyPath(type));
            fs.chmodSync(this.keyPath(type), 0o600);
            result[type] = "imported";
        }

        this.clearCache();
        return result;
    }
}
