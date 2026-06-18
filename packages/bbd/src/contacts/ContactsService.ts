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
}

/**
 * The seam to the contacts backend. The production implementation
 * ({@link MacContactsSource}) wraps the native `node-mac-contacts`; the core depends
 * only on this interface, so it never statically imports the native addon (the same
 * isolation used for firebase-admin and Electron).
 */
export interface ContactsSource {
    getAllContacts(): Promise<Contact[]>;
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
}
