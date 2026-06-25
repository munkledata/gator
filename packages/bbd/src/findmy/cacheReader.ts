import fs from "node:fs";
import { FindMyKeyManager } from "./FindMyKeyManager";
import { decryptCacheBuffer } from "./decrypt/cache";

/**
 * A located entry from an fmipcore cache (`Devices.data` = Apple devices, `Items.data` = items /
 * AirTags). Both files share this logical shape; the split is by source/endpoint, not field set.
 * `address` is the raw Apple address object (the app reads `mapItemFullAddressLabel` / `label`).
 */
export interface FindMyDevice {
    name: string | null;
    deviceModel: string | null;
    batteryLevel: number | null;
    coordinates: [number, number] | null;
    address: unknown;
}

/** The decrypted cache root may be an array or wrap one under a known key. */
function coerceArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        for (const k of ["items", "devices", "content", "payload"]) {
            if (Array.isArray(o[k])) return o[k] as unknown[];
        }
    }
    return [];
}

function mapEntry(d: unknown): FindMyDevice {
    const dev = (d ?? {}) as Record<string, unknown>;
    const loc = dev["location"] as Record<string, unknown> | undefined;
    const coordinates =
        loc && typeof loc["latitude"] === "number" && typeof loc["longitude"] === "number"
            ? ([loc["latitude"], loc["longitude"]] as [number, number])
            : null;
    return {
        name: typeof dev["name"] === "string" ? (dev["name"] as string) : null,
        deviceModel: typeof dev["deviceModel"] === "string" ? (dev["deviceModel"] as string) : null,
        batteryLevel: typeof dev["batteryLevel"] === "number" ? (dev["batteryLevel"] as number) : null,
        coordinates,
        // Pass the address object through verbatim; the client picks the display label.
        address: dev["address"] ?? null
    };
}

/**
 * Read an fmipcore `.data` cache (Devices or Items) and map it to located entries. On macOS 14.4+
 * (`encrypted`) it decrypts with the imported FMIP key (ChaCha20); below it reads plaintext JSON.
 * Best-effort: any failure (file absent, key not imported, wrong key, malformed) → empty list.
 */
export async function readFindMyCache(filePath: string, encrypted: boolean): Promise<FindMyDevice[]> {
    let buffer: Buffer;
    try {
        buffer = fs.readFileSync(filePath);
    } catch {
        return [];
    }

    let parsed: unknown;
    if (encrypted) {
        const key = await FindMyKeyManager.loadCacheKey("FMIP");
        if (!key) return []; // keys not imported yet
        try {
            parsed = await decryptCacheBuffer(buffer, key);
        } catch {
            return [];
        }
    } else {
        try {
            parsed = JSON.parse(buffer.toString("utf8"));
        } catch {
            return [];
        }
    }

    return coerceArray(parsed).map(mapEntry);
}
