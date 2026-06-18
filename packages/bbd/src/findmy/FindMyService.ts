import type { Logger } from "../core/logger";
import type { PrivateApiTransport } from "../private-api/PrivateApiTransport";
import { callPrivateApi } from "../private-api/call";

export interface FindMyFriend {
    handle: string | null;
    coordinates: [number, number] | null;
    longAddress: string | null;
    shortAddress: string | null;
    lastUpdated: number | null;
}

/**
 * FindMy *friends* — refreshed through the Private API (the dylib drives FindMy and
 * returns locations) and cached so the get endpoint is cheap. The legacy server kept
 * a similar `FindMyFriendsCache`.
 */
export class FindMyService {
    readonly #transport: PrivateApiTransport;
    readonly #logger: Logger;
    #cache: FindMyFriend[] = [];

    constructor(transport: PrivateApiTransport, logger: Logger) {
        this.#transport = transport;
        this.#logger = logger.child({ component: "FindMyService" });
    }

    async refreshFriends(): Promise<FindMyFriend[]> {
        const res = await callPrivateApi(this.#transport, "refresh-findmy-friends", {});
        const locations = res.data?.["locations"];
        this.#cache = Array.isArray(locations) ? (locations as FindMyFriend[]) : [];
        this.#logger.debug(`refreshed ${this.#cache.length} FindMy friend(s)`);
        return this.#cache;
    }

    getFriends(): FindMyFriend[] {
        return this.#cache;
    }
}
