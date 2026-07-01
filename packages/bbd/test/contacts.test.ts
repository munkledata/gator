import { test } from "node:test";
import assert from "node:assert/strict";
import { ContactsService, type Contact, type ContactsSource, type AvatarSize } from "../src/contacts/ContactsService";
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
    hasAvatar: true,
    avatarEtag: "etag-1"
};

class FakeSource implements ContactsSource {
    constructor(
        private result: Contact[] | Error,
        private avatars: Record<string, Buffer> = {}
    ) {}
    async getAllContacts(): Promise<Contact[]> {
        if (this.result instanceof Error) throw this.result;
        return this.result;
    }
    async getAvatar(id: string, _size: AvatarSize): Promise<Buffer | null> {
        return this.avatars[id] ?? null;
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

test("query-contacts matches by phone (normalized) and email (case-insensitive)", async () => {
    const svc = new ContactsService(new FakeSource([SAMPLE]), silent);
    const byPhone = await svc.queryByAddresses(["5551234567"]); // no +1 / country code
    assert.equal(byPhone.length, 1);
    const byEmail = await svc.queryByAddresses(["ALICE@example.com"]);
    assert.equal(byEmail.length, 1);
    const miss = await svc.queryByAddresses(["+19995550000"]);
    assert.equal(miss.length, 0);
});

test("getAvatar returns bytes when present, null otherwise", async () => {
    const svc = new ContactsService(new FakeSource([SAMPLE], { c1: Buffer.from([1, 2, 3]) }), silent);
    assert.deepEqual(await svc.getAvatar("c1", "thumb"), Buffer.from([1, 2, 3]));
    assert.equal(await svc.getAvatar("nope", "full"), null);
});
