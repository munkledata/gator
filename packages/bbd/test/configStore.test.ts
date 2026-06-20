import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryConfigStore } from "../src/data/config-db/ConfigStore";
import type { FcmDevice } from "../src/notifications/types";

test("getConfig returns defaults; setConfig merges + persists + re-validates", async () => {
    const store = new InMemoryConfigStore();
    assert.equal(store.getConfig().socketPort, 1234);
    const updated = await store.setConfig({ socketPort: 9000 });
    assert.equal(updated.socketPort, 9000);
    assert.equal(store.getConfig().socketPort, 9000);
});

test("device CRUD with the provider discriminator", async () => {
    const store = new InMemoryConfigStore();
    const device: FcmDevice = {
        id: "d1",
        name: "Phone",
        provider: "fcm",
        token: "fcm-token-abc",
        createdAt: 1
    };
    await store.upsertDevice(device);
    assert.deepEqual(await store.listDevices(), [device]);

    await store.upsertDevice({ ...device, name: "Renamed" });
    const after = await store.listDevices();
    assert.equal(after.length, 1);
    assert.equal(after[0]!.name, "Renamed");

    await store.removeDevice("d1");
    assert.deepEqual(await store.listDevices(), []);
});
