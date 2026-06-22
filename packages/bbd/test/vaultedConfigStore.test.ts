import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryConfigStore } from "../src/data/config-db/ConfigStore";
import { InMemorySecretStore } from "../src/data/config-db/SecretStore";
import { VaultedConfigStore } from "../src/data/config-db/VaultedConfigStore";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });

const SA = { private_key: "-----BEGIN PRIVATE KEY-----\nABC==\n", client_email: "svc@proj.iam" };

function seeded() {
    return new InMemoryConfigStore({
        password: "pw",
        cloudflareDdnsApiToken: "cf-token",
        zrok_token: "zrok-token",
        notifications: {
            fcm: { serviceAccount: SA, oauthClientSecret: "oauth-secret" },
            webpush: { vapidPrivateKey: "vapid-priv" }
        }
    });
}

test("migration: cloud secrets move to the keychain, are redacted on disk, hydrated in memory", async () => {
    const secrets = new InMemorySecretStore();
    const inner = seeded();
    const store = await VaultedConfigStore.create(inner, secrets, silent);

    // In-memory config is fully hydrated (consumers see the real values).
    const cfg = store.getConfig();
    assert.deepEqual(cfg.notifications.fcm.serviceAccount, SA);
    assert.equal(cfg.notifications.fcm.oauthClientSecret, "oauth-secret");
    assert.equal(cfg.notifications.webpush.vapidPrivateKey, "vapid-priv");
    assert.equal(cfg.cloudflareDdnsApiToken, "cf-token");
    assert.equal((cfg as Record<string, unknown>).zrok_token, "zrok-token");

    // The keychain holds them.
    assert.equal(await secrets.get("notifications.fcm.serviceAccount"), JSON.stringify(SA));
    assert.equal(await secrets.get("notifications.fcm.oauthClientSecret"), "oauth-secret");
    assert.equal(await secrets.get("notifications.webpush.vapidPrivateKey"), "vapid-priv");
    assert.equal(await secrets.get("cloudflareDdnsApiToken"), "cf-token");
    assert.equal(await secrets.get("zrok_token"), "zrok-token");

    // The on-disk (inner) config no longer contains ANY of the secret values.
    const disk = inner.getConfig() as Record<string, unknown>;
    const notif = disk.notifications as { fcm: Record<string, unknown>; webpush: Record<string, unknown> };
    assert.ok(notif.fcm.serviceAccount == null, "serviceAccount redacted on disk");
    assert.notEqual(notif.fcm.oauthClientSecret, "oauth-secret");
    assert.notEqual(notif.webpush.vapidPrivateKey, "vapid-priv");
    assert.notEqual(disk.cloudflareDdnsApiToken, "cf-token");
    assert.notEqual(disk.zrok_token, "zrok-token");
    // Non-cloud secret (`password`) intentionally stays in the DB.
    assert.equal(disk.password, "pw");
});

test("idempotent: a second create() (restart) re-hydrates from the keychain, disk stays redacted", async () => {
    const secrets = new InMemorySecretStore();
    const inner = seeded();
    await VaultedConfigStore.create(inner, secrets, silent);
    const store2 = await VaultedConfigStore.create(inner, secrets, silent);

    assert.equal(store2.getConfig().cloudflareDdnsApiToken, "cf-token");
    assert.deepEqual(store2.getConfig().notifications.fcm.serviceAccount, SA);
    assert.notEqual((inner.getConfig() as Record<string, unknown>).cloudflareDdnsApiToken, "cf-token");
});

test("setConfig vaults a newly-set secret and keeps it off disk", async () => {
    const secrets = new InMemorySecretStore();
    const inner = new InMemoryConfigStore({});
    const store = await VaultedConfigStore.create(inner, secrets, silent);

    await store.setConfig({ cloudflareDdnsApiToken: "new-token" } as never);

    assert.equal(store.getConfig().cloudflareDdnsApiToken, "new-token");
    assert.equal(await secrets.get("cloudflareDdnsApiToken"), "new-token");
    assert.notEqual((inner.getConfig() as Record<string, unknown>).cloudflareDdnsApiToken, "new-token");
});

test("verify-before-redact: a keychain write failure NEVER loses the credential", async () => {
    class FailingSecrets extends InMemorySecretStore {
        override async set(): Promise<void> {
            throw new Error("keychain write boom");
        }
    }
    const secrets = new FailingSecrets();
    const inner = new InMemoryConfigStore({ cloudflareDdnsApiToken: "cf-token" });
    const store = await VaultedConfigStore.create(inner, secrets, silent);

    // Vaulting failed → the secret is preserved BOTH in memory and on disk (no redaction).
    assert.equal(store.getConfig().cloudflareDdnsApiToken, "cf-token");
    assert.equal((inner.getConfig() as Record<string, unknown>).cloudflareDdnsApiToken, "cf-token");
});

test("clearing a secret tombstones it in the keychain so it is NOT resurrected on restart", async () => {
    const secrets = new InMemorySecretStore();
    const inner = new InMemoryConfigStore({ cloudflareDdnsApiToken: "cf-token" });
    const store = await VaultedConfigStore.create(inner, secrets, silent);
    assert.equal(await secrets.get("cloudflareDdnsApiToken"), "cf-token");

    // User clears the credential.
    await store.setConfig({ cloudflareDdnsApiToken: "" } as never);

    // Restart: a fresh store must NOT bring the old token back from the keychain.
    const restarted = await VaultedConfigStore.create(inner, secrets, silent);
    assert.equal(restarted.getConfig().cloudflareDdnsApiToken, "");
});

test("clear still neutralizes the keychain even if delete() fails (tombstone fallback)", async () => {
    class NoDeleteSecrets extends InMemorySecretStore {
        override async delete(): Promise<void> {
            throw new Error("delete unsupported");
        }
    }
    const secrets = new NoDeleteSecrets();
    const inner = new InMemoryConfigStore({ cloudflareDdnsApiToken: "cf-token" });
    const store = await VaultedConfigStore.create(inner, secrets, silent);

    await store.setConfig({ cloudflareDdnsApiToken: "" } as never);

    // delete() threw, so the fallback overwrote it with an empty tombstone → hydrate ignores it.
    assert.equal(await secrets.get("cloudflareDdnsApiToken"), "");
    const restarted = await VaultedConfigStore.create(inner, secrets, silent);
    assert.equal(restarted.getConfig().cloudflareDdnsApiToken, "");
});

test("concurrent setConfig calls do not lose updates (write mutex)", async () => {
    const secrets = new InMemorySecretStore();
    const inner = new InMemoryConfigStore({});
    const store = await VaultedConfigStore.create(inner, secrets, silent);

    // Fire two independent updates without awaiting between them.
    await Promise.all([
        store.setConfig({ cloudflareDdnsApiToken: "tok-A" } as never),
        store.setConfig({ acmeEmail: "me@example.com" } as never)
    ]);

    const cfg = store.getConfig();
    assert.equal(cfg.cloudflareDdnsApiToken, "tok-A", "first update survived");
    assert.equal(cfg.acmeEmail, "me@example.com", "second update survived");
    assert.equal(await secrets.get("cloudflareDdnsApiToken"), "tok-A");
});

test("unavailable secret store: degrades to plaintext passthrough, never crashes", async () => {
    const secrets = new InMemorySecretStore(false); // available=false
    const inner = new InMemoryConfigStore({ cloudflareDdnsApiToken: "cf-token" });
    const store = await VaultedConfigStore.create(inner, secrets, silent);

    assert.equal(store.getConfig().cloudflareDdnsApiToken, "cf-token");
    assert.equal((inner.getConfig() as Record<string, unknown>).cloudflareDdnsApiToken, "cf-token");

    await store.setConfig({ password: "x" } as never);
    assert.equal((inner.getConfig() as Record<string, unknown>).password, "x");
    assert.equal(await secrets.get("cloudflareDdnsApiToken"), null); // nothing vaulted
});
