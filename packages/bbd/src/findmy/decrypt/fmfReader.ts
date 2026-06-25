import fs from "node:fs";
import { decryptCacheBuffer } from "./cache";
import { FMF_FRIEND_CACHE_PATH } from "../paths";

/**
 * Reads friend display names from the encrypted FMF cache (`FriendCacheData.data`). Ported from
 * upstream PR #810. The decrypted plaintext is a binary plist dict whose `contacts` map is keyed by
 * findMyId and holds `{ displayName, ... }` per friend.
 *
 * @returns A map of findMyId (trailing `~` stripped) -> displayName.
 */
export const readFmfContacts = async (fmfKey: Buffer): Promise<Record<string, string>> => {
    if (!fs.existsSync(FMF_FRIEND_CACHE_PATH)) return {};

    const decrypted = await decryptCacheBuffer(fs.readFileSync(FMF_FRIEND_CACHE_PATH), fmfKey);
    const contacts = decrypted?.contacts;
    if (!contacts || typeof contacts !== "object") return {};

    const names: Record<string, string> = {};
    for (const [rawId, info] of Object.entries<any>(contacts)) {
        const id = rawId.replace(/~+$/, "");
        const displayName = info?.displayName;
        if (id && typeof displayName === "string" && displayName.length > 0) {
            names[id] = displayName;
        }
    }

    return names;
};
