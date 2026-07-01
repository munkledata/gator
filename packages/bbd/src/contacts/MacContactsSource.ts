import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import type { AvatarSize, Contact, ContactsSource } from "./ContactsService";

const nodeRequire = createRequire(import.meta.url);

/**
 * Production contacts backend, wrapping the native `node-mac-contacts`. Loaded via
 * `createRequire` (returning `any`) so the bbd core has no compile-time dependency
 * on the addon — it's only needed at runtime, when contacts are actually requested.
 * The native module needs the Contacts TCC permission.
 */
export class MacContactsSource implements ContactsSource {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #mac(): any {
        return nodeRequire("node-mac-contacts");
    }

    async getAllContacts(): Promise<Contact[]> {
        // NOTE: phoneNumbers/emailAddresses are ALWAYS returned — the extraProperties list is
        // for the OPT-IN heavy fields. We fetch the small thumbnail so hasAvatar is accurate
        // (it was always false before: contactImage/Thumbnail are absent unless requested) and
        // so we can compute an etag; the full photo is fetched lazily by getAvatar().
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any[] = this.#mac().getAllContacts(["contactThumbnailImage"]) ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return raw.map((c: any): Contact => {
            const first = typeof c.firstName === "string" ? c.firstName : null;
            const last = typeof c.lastName === "string" ? c.lastName : null;
            const displayName =
                [first, last].filter(Boolean).join(" ") ||
                (typeof c.organizationName === "string" ? c.organizationName : "") ||
                (typeof c.nickname === "string" ? c.nickname : "");
            const strings = (arr: unknown): string[] =>
                Array.isArray(arr) ? arr.map(v => (typeof v === "string" ? v : String(v?.value ?? ""))).filter(Boolean) : [];
            const thumb: unknown = c.contactThumbnailImage;
            const hasAvatar = Buffer.isBuffer(thumb) && thumb.length > 0;
            return {
                id: String(c.identifier ?? ""),
                displayName,
                firstName: first,
                lastName: last,
                phoneNumbers: strings(c.phoneNumbers),
                emails: strings(c.emailAddresses),
                hasAvatar,
                avatarEtag: hasAvatar ? createHash("sha1").update(thumb as Buffer).digest("hex") : null
            };
        });
    }

    async getAvatar(id: string, size: AvatarSize): Promise<Buffer | null> {
        // node-mac-contacts has no by-id fetch, so read the requested image property for all
        // contacts and pick ours. Rare in practice — the client etag-caches avatars, so this
        // runs at most once per contact-photo change (thumb is the small default; full is
        // opt-in and heavier). Fetches ONLY the requested image field to bound the cost.
        const prop = size === "full" ? "contactImage" : "contactThumbnailImage";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any[] = this.#mac().getAllContacts([prop]) ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = raw.find((c: any) => String(c.identifier ?? "") === id);
        const img: unknown = found?.[prop];
        return Buffer.isBuffer(img) && img.length > 0 ? img : null;
    }
}
