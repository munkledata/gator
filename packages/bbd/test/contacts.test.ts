import { test } from "node:test";
import assert from "node:assert/strict";
import { ContactsService, type Contact, type ContactsSource } from "../src/contacts/ContactsService";
import { buildContactsOperations } from "../src/api/operations/contactsOperations";
import { executeOperation } from "../src/api/execute";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

const SAMPLE: Contact = {
    id: "c1",
    displayName: "Alice Smith",
    firstName: "Alice",
    lastName: "Smith",
    phoneNumbers: ["+15551234567"],
    emails: ["alice@example.com"],
    hasAvatar: false
};

class FakeSource implements ContactsSource {
    constructor(private result: Contact[] | Error) {}
    async getAllContacts(): Promise<Contact[]> {
        if (this.result instanceof Error) throw this.result;
        return this.result;
    }
}

test("get-contacts returns the contacts from the source", async () => {
    const svc = new ContactsService(new FakeSource([SAMPLE]), silent);
    const [op] = buildContactsOperations({ contacts: svc });
    const r = await executeOperation(op!, { input: {}, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    assert.deepEqual((r.data as { contacts: Contact[] }).contacts, [SAMPLE]);
});

test("a source failure (e.g. denied permission) degrades to an empty list", async () => {
    const svc = new ContactsService(new FakeSource(new Error("Contacts permission denied")), silent);
    assert.deepEqual(await svc.list(), []);
});

test("get-contacts requires auth", async () => {
    const [op] = buildContactsOperations({ contacts: new ContactsService(new FakeSource([]), silent) });
    assert.equal((await executeOperation(op!, { input: {} }, ctx, auth)).status, 401);
});
