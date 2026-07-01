import type { Logger } from "../core/logger";

/** A contact in the wire-facing shape. */
export interface Contact {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumbers: string[];
    emails: string[];
    hasAvatar: boolean;
    /**
     * A marker that changes when the contact's photo changes (sha1 of the thumbnail bytes),
     * so the client can cache the fetched avatar and re-download only when it changes. Null
     * when there's no photo. The bytes themselves are served by the raw avatar route, never
     * inlined here (they'd bloat the list ~33% as base64).
     */
    avatarEtag: string | null;
}

/** thumb = small list thumbnail (default); full = full-resolution photo. */
export type AvatarSize = "thumb" | "full";

/**
 * The seam to the contacts backend. The production implementation
 * ({@link MacContactsSource}) wraps the native `node-mac-contacts`; the core depends
 * only on this interface, so it never statically imports the native addon (the same
 * isolation used for firebase-admin and Electron).
 */
export interface ContactsSource {
    getAllContacts(): Promise<Contact[]>;
    /** Raw avatar bytes for one contact (by id), or null when it has no photo. */
    getAvatar(id: string, size: AvatarSize): Promise<Buffer | null>;
}

/** Normalize an address for matching: emails → lowercased; phone numbers → last 10 digits. */
function normalizeAddress(addr: string): string {
    const a = addr.trim();
    if (a.includes("@")) return a.toLowerCase();
    const digits = a.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Loads contacts, turning a backend failure (e.g. denied Contacts permission) into
 *  an empty list rather than a crash. */
export class ContactsService {
    readonly #source: ContactsSource;
    readonly #logger: Logger;

    constructor(source: ContactsSource, logger: Logger) {
        this.#source = source;
        this.#logger = logger.child({ component: "ContactsService" });
    }

    async list(): Promise<Contact[]> {
        try {
            return await this.#source.getAllContacts();
        } catch (e) {
            this.#logger.error("failed to load contacts", e);
            return [];
        }
    }

    /** Contacts matching any of the given phone numbers / emails (address-keyed lookup). */
    async queryByAddresses(addresses: string[]): Promise<Contact[]> {
        const wanted = new Set(addresses.map(normalizeAddress).filter(a => a.length > 0));
        if (wanted.size === 0) return [];
        return (await this.list()).filter(
            c =>
                c.phoneNumbers.some(p => wanted.has(normalizeAddress(p))) ||
                c.emails.some(e => wanted.has(normalizeAddress(e)))
        );
    }

    /** Raw avatar bytes for a contact id (null on absence / error), for the avatar route. */
    async getAvatar(id: string, size: AvatarSize): Promise<Buffer | null> {
        try {
            return await this.#source.getAvatar(id, size);
        } catch (e) {
            this.#logger.error("failed to load contact avatar", e);
            return null;
        }
    }
}
