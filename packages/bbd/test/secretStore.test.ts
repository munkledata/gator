import { test } from "node:test";
import assert from "node:assert/strict";
import { MacKeychainSecretStore, InMemorySecretStore } from "../src/data/config-db/SecretStore";

test("InMemorySecretStore round-trips and reports availability", async () => {
    const s = new InMemorySecretStore();
    assert.equal(await s.available(), true);
    assert.equal(await s.get("a"), null);
    await s.set("a", "secret");
    assert.equal(await s.get("a"), "secret");
    await s.delete("a");
    assert.equal(await s.get("a"), null);

    const off = new InMemorySecretStore(false);
    assert.equal(await off.available(), false);
});

// Exercises the real macOS login Keychain via the `security` CLI. Uses a throwaway service so it
// never touches the production "bluebubbles-server" items, and cleans up after itself.
test(
    "MacKeychainSecretStore round-trips arbitrary bytes via the security CLI",
    { skip: process.platform !== "darwin" ? "macOS only" : false },
    async () => {
        const svc = `bbtest-${process.pid}-${process.hrtime.bigint()}`;
        const store = new MacKeychainSecretStore(svc);
        assert.equal(await store.available(), true);
        try {
            assert.equal(await store.get("acct"), null, "absent → null");

            const value = '{"private_key":"-----BEGIN PRIVATE KEY-----\\nXYZ==\\n","email":"a@b.com"}';
            await store.set("acct", value);
            assert.equal(await store.get("acct"), value, "exact round-trip incl. special chars");

            await store.set("acct", "updated"); // -U updates in place
            assert.equal(await store.get("acct"), "updated");
        } finally {
            await store.delete("acct");
            assert.equal(await store.get("acct"), null, "deleted");
        }
    }
);
