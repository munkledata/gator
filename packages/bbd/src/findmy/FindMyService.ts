import fs from "node:fs";
import type { Logger } from "../core/logger";
import type { PrivateApiTransport } from "../private-api/PrivateApiTransport";
import { callPrivateApi } from "../private-api/call";
import { isMinSonoma14_4 } from "./macosVersion";
import { FindMyKeyManager } from "./FindMyKeyManager";
import { LOCAL_STORAGE_DB_PATH } from "./paths";
import { readFriendLocations, type RawFriendLocation } from "./decrypt/localStorageReader";
import { readFmfContacts } from "./decrypt/fmfReader";

export interface FindMyFriend {
    handle: string | null;
    coordinates: [number, number] | null;
    longAddress?: string | null;
    shortAddress?: string | null;
    /** Display name (FMF cache) — the app reads this as the friend's `name`. */
    title?: string | null;
    lastUpdated?: number | null;
    /** The app's normalizer reads snake_case `last_updated`. */
    last_updated?: number | null;
}

/** Build a friend wire object from a decrypted coordinate row + the FMF display-name map. */
function buildFriend(raw: RawFriendLocation, names: Record<string, string>): FindMyFriend {
    const loc = raw.location ?? {};
    const lat = typeof loc.latitude === "number" ? loc.latitude : null;
    const lng = typeof loc.longitude === "number" ? loc.longitude : null;

    // timestamp may be a plist Date, seconds, or ms — normalize to ms.
    const ts = loc.timestamp;
    let last: number | null = null;
    if (ts instanceof Date) last = ts.getTime();
    else if (typeof ts === "number") last = ts > 1e12 ? ts : Math.round(ts * 1000);

    return {
        handle: raw.handle ?? null,
        title: names[raw.findMyId] ?? raw.handle ?? raw.findMyId,
        coordinates: lat != null && lng != null ? [lat, lng] : null,
        // Addresses aren't persisted in the friend cache (only coords); clients geocode.
        longAddress: null,
        shortAddress: null,
        last_updated: last,
        lastUpdated: last
    };
}

/**
 * FindMy *friends*. On **macOS 14.4+** the Private API helper no longer works and the caches are
 * encrypted, so we read + decrypt `LocalStorage.db` (coordinates) joined with the FMF cache (display
 * names). On older macOS the Private API path is used. Results are cached so the GET endpoint is cheap.
 */
export class FindMyService {
    readonly #transport: PrivateApiTransport;
    readonly #logger: Logger;
    readonly #encrypted: boolean;
    #cache: FindMyFriend[] = [];

    constructor(transport: PrivateApiTransport, logger: Logger, encrypted: boolean = isMinSonoma14_4()) {
        this.#transport = transport;
        this.#logger = logger.child({ component: "FindMyService" });
        // macOS 14.4+ → decrypt the cache; below → Private API. Injectable for tests.
        this.#encrypted = encrypted;
    }

    async refreshFriends(): Promise<FindMyFriend[]> {
        if (this.#encrypted) {
            this.#cache = await this.#refreshFromCache();
            return this.#cache;
        }

        const res = await callPrivateApi(this.#transport, "refresh-findmy-friends", {});
        const locations = res.data?.["locations"];
        this.#cache = Array.isArray(locations) ? (locations as FindMyFriend[]) : [];
        this.#logger.debug(`refreshed ${this.#cache.length} FindMy friend(s) via private api`);
        return this.#cache;
    }

    getFriends(): FindMyFriend[] {
        return this.#cache;
    }

    async #refreshFromCache(): Promise<FindMyFriend[]> {
        const lsKey = FindMyKeyManager.loadLocalStorageKey();
        if (!lsKey) {
            this.#logger.debug("FindMy LocalStorage key not imported — cannot read friends on macOS 14.4+");
            return [];
        }
        if (!fs.existsSync(LOCAL_STORAGE_DB_PATH)) {
            this.#logger.debug("FindMy LocalStorage.db not found");
            return [];
        }

        let raw: RawFriendLocation[];
        try {
            raw = readFriendLocations(lsKey);
        } catch (ex) {
            this.#logger.debug(`Failed to decrypt FindMy friends: ${String(ex)}`);
            return [];
        }

        let names: Record<string, string> = {};
        const fmfKey = await FindMyKeyManager.loadCacheKey("FMF");
        if (fmfKey) {
            try {
                names = await readFmfContacts(fmfKey);
            } catch {
                // best effort — names are optional
            }
        }

        const friends = raw.map((r) => buildFriend(r, names));
        this.#logger.debug(`decrypted ${friends.length} FindMy friend(s) from cache`);
        return friends;
    }
}
