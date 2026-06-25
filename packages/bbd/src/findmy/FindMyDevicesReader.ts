import { isMinSonoma14_4 } from "./macosVersion";
import { DEVICES_DATA_PATH } from "./paths";
import { readFindMyCache, type FindMyDevice } from "./cacheReader";

export type { FindMyDevice } from "./cacheReader";

/**
 * Reads Apple *devices* (iPhone/iPad/Mac/Watch) from Find My's `Devices.data` cache. Decrypted on
 * macOS 14.4+ (via the FMIP key), plaintext JSON below. Items / AirTags come from
 * {@link FindMyItemsReader} (`Items.data`) instead.
 */
export class FindMyDevicesReader {
    readonly #path: string;
    readonly #encrypted: boolean;

    constructor(filePath: string = DEVICES_DATA_PATH, encrypted: boolean = isMinSonoma14_4()) {
        this.#path = filePath;
        this.#encrypted = encrypted;
    }

    read(): Promise<FindMyDevice[]> {
        return readFindMyCache(this.#path, this.#encrypted);
    }
}
