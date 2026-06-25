import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isMinSonoma14_4 } from "./macosVersion";
import { FindMyKeyManager } from "./FindMyKeyManager";
import { decryptCacheBuffer } from "./decrypt/cache";

export interface FindMyDevice {
    name: string | null;
    deviceModel: string | null;
    batteryLevel: number | null;
    coordinates: [number, number] | null;
}

/** The decrypted cache root may be an array or wrap one under a known key. */
function coerceArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        for (const k of ["items", "devices", "content"]) {
            if (Array.isArray(o[k])) return o[k] as unknown[];
        }
    }
    return [];
}

/**
 * Reads FindMy *devices/items* from Apple's local FindMy cache (`Items.data`).
 *
 * On **macOS 14.4+** the cache is ChaCha20-Poly1305 encrypted — we decrypt it with the imported
 * FMIP key. On older macOS it's plaintext JSON. Any problem (file absent, key not imported, wrong
 * key, malformed) degrades to an empty list — FindMy is best-effort and must never crash the daemon.
 */
export class FindMyDevicesReader {
    readonly #path: string;
    readonly #encrypted: boolean;

    constructor(
        filePath: string = path.join(os.homedir(), "Library", "Caches", "com.apple.findmy.fmipcore", "Items.data"),
        // Whether the cache is encrypted (macOS 14.4+). Injectable so tests can exercise the
        // plaintext path regardless of the host OS version.
        encrypted: boolean = isMinSonoma14_4()
    ) {
        this.#path = filePath;
        this.#encrypted = encrypted;
    }

    async read(): Promise<FindMyDevice[]> {
        const parsed = await this.#load();
        return coerceArray(parsed).map((d): FindMyDevice => {
            const dev = (d ?? {}) as Record<string, unknown>;
            const loc = dev["location"] as Record<string, unknown> | undefined;
            const coords =
                loc && typeof loc["latitude"] === "number" && typeof loc["longitude"] === "number"
                    ? ([loc["latitude"], loc["longitude"]] as [number, number])
                    : null;
            return {
                name: typeof dev["name"] === "string" ? (dev["name"] as string) : null,
                deviceModel: typeof dev["deviceModel"] === "string" ? (dev["deviceModel"] as string) : null,
                batteryLevel: typeof dev["batteryLevel"] === "number" ? (dev["batteryLevel"] as number) : null,
                coordinates: coords
            };
        });
    }

    async #load(): Promise<unknown> {
        let buffer: Buffer;
        try {
            buffer = fs.readFileSync(this.#path);
        } catch {
            return null;
        }

        if (this.#encrypted) {
            const key = await FindMyKeyManager.loadCacheKey("FMIP");
            if (!key) return null; // keys not imported yet
            try {
                return await decryptCacheBuffer(buffer, key);
            } catch {
                return null;
            }
        }

        try {
            return JSON.parse(buffer.toString("utf8"));
        } catch {
            return null;
        }
    }
}
