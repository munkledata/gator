import os from "node:os";
import path from "node:path";

/**
 * Filesystem locations for Apple's Find My caches and our imported decryption keys.
 *
 * On macOS 14.4+ the FMIP/FMF `.data` caches are ChaCha20-Poly1305 encrypted and the friend
 * coordinate DB uses a custom AES-256 page codec; below 14.4 the `.data` files are plaintext JSON.
 */

const home = os.homedir();

/** FMIP cache — Apple devices (`Devices.data`) + Find My items/AirTags (`Items.data`). */
export const FMIP_CACHE_DIR = path.join(home, "Library", "Caches", "com.apple.findmy.fmipcore");
export const ITEMS_DATA_PATH = path.join(FMIP_CACHE_DIR, "Items.data");
export const DEVICES_DATA_PATH = path.join(FMIP_CACHE_DIR, "Devices.data");

/** FMF cache — friend display names (`FriendCacheData.data`). */
export const FMF_CACHE_DIR = path.join(home, "Library", "Caches", "com.apple.findmy.fmfcore");
export const FMF_FRIEND_CACHE_PATH = path.join(FMF_CACHE_DIR, "FriendCacheData.data");

/** Encrypted SQLite DB holding friend coordinates (macOS 14.0+). */
export const LOCAL_STORAGE_DB_PATH = path.join(
    home,
    "Library",
    "Group Containers",
    "group.com.apple.findmy.findmylocateagent",
    "Library",
    "Application Support",
    "LocalStorage.db"
);

/** Where the user-imported Find My decryption keys live (BlueBubbles config dir). */
export const FIND_MY_KEYS_DIR = path.join(
    home,
    "Library",
    "Application Support",
    "bluebubbles-server",
    "FindMyKeys"
);
