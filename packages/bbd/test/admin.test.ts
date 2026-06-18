import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminOperations } from "../src/api/operations/adminOperations";
import { executeOperation } from "../src/api/execute";
import { ConfigService } from "../src/config/ConfigService";
import { InMemoryConfigStore } from "../src/data/config-db/ConfigStore";
import { EventBus } from "../src/core/bus";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

function setup() {
    const store = new InMemoryConfigStore();
    const svc = new ConfigService(store, new EventBus(), silent);
    const ops = buildAdminOperations({ configService: svc, version: "2.0.0", startedAt: 0, now: () => 5000 });
    const byName = (n: string) => ops.find(o => o.name === n)!;
    return { svc, byName };
}

test("admin-update-config applies a patch and returns config without the password", async () => {
    const { svc, byName } = setup();
    const r = await executeOperation(
        byName("admin-update-config"),
        { input: { socketPort: 7777 }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    assert.equal((r.data as { socketPort: number }).socketPort, 7777);
    assert.equal((r.data as Record<string, unknown>)["password"], undefined);
    assert.equal(svc.get().socketPort, 7777);
});

test("admin-server-status reports version and uptime", async () => {
    const { byName } = setup();
    const r = await executeOperation(byName("admin-server-status"), { input: {}, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { version: "2.0.0", uptimeMs: 5000 });
});

test("admin operations require auth", async () => {
    const { byName } = setup();
    const r = await executeOperation(byName("admin-server-status"), { input: {} }, ctx, auth);
    assert.equal(r.status, 401);
});
