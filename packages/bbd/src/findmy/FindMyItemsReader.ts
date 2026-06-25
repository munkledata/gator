import { isMinSonoma14_4 } from "./macosVersion";
import { ITEMS_DATA_PATH } from "./paths";
import { readFindMyCache, type FindMyDevice } from "./cacheReader";

/**
 * Reads Find My *items* / AirTags (and other accessories) from the `Items.data` cache. Same logical
 * shape + decryption as {@link FindMyDevicesReader}, just a different source file + endpoint — so the
 * inbox of "devices" no longer conflates AirTags with real Apple devices.
 */
export class FindMyItemsReader {
    readonly #path: string;
    readonly #encrypted: boolean;

    constructor(filePath: string = ITEMS_DATA_PATH, encrypted: boolean = isMinSonoma14_4()) {
        this.#path = filePath;
        this.#encrypted = encrypted;
    }

    read(): Promise<FindMyDevice[]> {
        return readFindMyCache(this.#path, this.#encrypted);
    }
}
