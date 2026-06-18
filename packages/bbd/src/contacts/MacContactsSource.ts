import { createRequire } from "node:module";
import type { Contact, ContactsSource } from "./ContactsService";

const nodeRequire = createRequire(import.meta.url);

/**
 * Production contacts backend, wrapping the native `node-mac-contacts`. Loaded via
 * `createRequire` (returning `any`) so the bbd core has no compile-time dependency
 * on the addon — it's only needed at runtime, when contacts are actually requested.
 * The native module needs the Contacts TCC permission.
 */
export class MacContactsSource implements ContactsSource {
    async getAllContacts(): Promise<Contact[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mac: any = nodeRequire("node-mac-contacts");
        const raw: any[] = mac.getAllContacts(["phoneNumbers", "emailAddresses"]) ?? [];
        return raw.map((c: any): Contact => {
            const first = typeof c.firstName === "string" ? c.firstName : null;
            const last = typeof c.lastName === "string" ? c.lastName : null;
            const displayName =
                [first, last].filter(Boolean).join(" ") ||
                (typeof c.organizationName === "string" ? c.organizationName : "") ||
                (typeof c.nickname === "string" ? c.nickname : "");
            const strings = (arr: unknown): string[] =>
                Array.isArray(arr) ? arr.map(v => (typeof v === "string" ? v : String(v?.value ?? ""))).filter(Boolean) : [];
            return {
                id: String(c.identifier ?? ""),
                displayName,
                firstName: first,
                lastName: last,
                phoneNumbers: strings(c.phoneNumbers),
                emails: strings(c.emailAddresses),
                hasAvatar: Boolean(c.contactImage || c.contactThumbnailImage)
            };
        });
    }
}
