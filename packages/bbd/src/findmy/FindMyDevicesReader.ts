import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface FindMyDevice {
    name: string | null;
    deviceModel: string | null;
    batteryLevel: number | null;
    coordinates: [number, number] | null;
}

/**
 * Reads FindMy *devices* from Apple's local FindMy cache file (a JSON array). Any
 * problem (file absent, no permission, malformed JSON) degrades to an empty list —
 * FindMy is best-effort and must never crash the daemon.
 */
export class FindMyDevicesReader {
    readonly #path: string;

    constructor(
        filePath: string = path.join(os.homedir(), "Library", "Caches", "com.apple.findmy.fmipcore", "Items.data")
    ) {
        this.#path = filePath;
    }

    read(): FindMyDevice[] {
        let raw: string;
        try {
            raw = fs.readFileSync(this.#path, "utf8");
        } catch {
            return [];
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
        if (!Array.isArray(parsed)) return [];

        return parsed.map((d): FindMyDevice => {
            const dev = d as Record<string, unknown>;
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
}
