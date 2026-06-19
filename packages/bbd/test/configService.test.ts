import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigService, type ConfigEvents } from "../src/config/ConfigService";
import { InMemoryConfigStore } from "../src/data/config-db/ConfigStore";
import { EventBus } from "../src/core/bus";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("test", { level: "fatal" });

test("update broadcasts the changed keys on the bus", async () => {
    const bus = new EventBus<ConfigEvents>();
    const seen: string[][] = [];
    bus.on("config-changed", changes => seen.push(changes.map(c => c.key)));

    const svc = new ConfigService(new InMemoryConfigStore(), bus, silent);
    await svc.update({ socketPort: 5555 });
    assert.deepEqual(seen, [["socketPort"]]);
});

test("a no-op update emits nothing", async () => {
    const bus = new EventBus<ConfigEvents>();
    let emitted = 0;
    bus.on("config-changed", () => emitted++);

    const svc = new ConfigService(new InMemoryConfigStore(), bus, silent);
    await svc.update({ socketPort: 1234 }); // already the default
    assert.equal(emitted, 0);
});

test("changing a nested notifications field is detected", async () => {
    const bus = new EventBus<ConfigEvents>();
    const seen: string[][] = [];
    bus.on("config-changed", changes => seen.push(changes.map(c => c.key)));

    const svc = new ConfigService(new InMemoryConfigStore(), bus, silent);
    const current = svc.get();
    await svc.update({ notifications: { ...current.notifications, defaultProvider: "webpush" } });
    assert.deepEqual(seen, [["notifications"]]);
});
