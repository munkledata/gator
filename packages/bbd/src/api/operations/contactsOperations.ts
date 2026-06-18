import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { ContactsService } from "../../contacts/ContactsService";

const NoInput = z.object({}).passthrough();

export interface ContactsOperationDeps {
    contacts: ContactsService;
}

/** The migrated contacts handler — get-contacts, served on both transports. */
export function buildContactsOperations(deps: ContactsOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "get-contacts",
            method: "GET",
            path: "/api/v1/contact",
            auth: true,
            input: NoInput,
            summary: "All address-book contacts",
            handler: async () => ({ contacts: await deps.contacts.list() })
        })
    ];
}
