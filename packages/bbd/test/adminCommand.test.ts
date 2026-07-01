import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminCommandOperations, type AdminCommandDeps } from "../src/api/operations/adminCommandOperations";
import { executeOperation } from "../src/api/execute";
import { ConfigService } from "../src/config/ConfigService";
import { InMemoryConfigStore } from "../src/data/config-db/ConfigStore";
import { EventBus } from "../src/core/bus";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const ctx = { logger: silent };
const auth = { password: "pw" };

/**
 * Build the admin-command dispatcher with a real config store/service and stub the rest of
 * the deps — the per-channel admin gate runs BEFORE any handler body, so unused services are
 * never touched for the channels under test.
 */
function setup() {
    const store = new InMemoryConfigStore();
    const configService = new ConfigService(store, new EventBus(), silent);
    const deps = {
        configService,
        configStore: store,
        version: "2.0.0",
        emit: () => {},
        logger: silent
        // The remaining services (chatReader, contacts, zrok, acme, …) are unused by the
        // channels these tests exercise; cast the partial object to the full deps type.
    } as unknown as AdminCommandDeps;
    const op = buildAdminCommandOperations(deps).find(o => o.name === "admin-command")!;
    return { op, store, configService };
}

test("set-config (destructive) is denied on the shared-password path (audit F15)", async () => {
    const { op, configService } = setup();
    const r = await executeOperation(
        op,
        { input: { channel: "set-config", data: { socket_port: 7777 } }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 403, "remote password caller is forbidden from a destructive admin channel");
    assert.equal(r.error?.type, "admin_only");
    // The config was NOT mutated (the gate fired before the handler).
    assert.notEqual(configService.get().socketPort, 7777);
});

test("set-config is allowed for the trusted local channel (audit F15)", async () => {
    const { op, configService } = setup();
    const r = await executeOperation(
        op,
        { input: { channel: "set-config", data: { socket_port: 7777 } }, trusted: true },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    assert.equal(configService.get().socketPort, 7777);
});

test("read/status channels stay on the normal password path (audit F15)", async () => {
    const { op } = setup();
    // get-env is a harmless status channel — a password-authed remote caller may use it.
    const r = await executeOperation(
        op,
        { input: { channel: "get-env" }, credential: "pw" },
        ctx,
        auth
    );
    assert.equal(r.status, 200);
    assert.equal((r.data as { version: string }).version, "2.0.0");
});

test("get-private-api-status reports messages + facetime connection and enabled flags", async () => {
    const store = new InMemoryConfigStore();
    const configService = new ConfigService(store, new EventBus(), silent);
    await configService.update({ enablePrivateApi: true, enableFtPrivateApi: false });
    const deps = {
        configService,
        configStore: store,
        version: "2.0.0",
        emit: () => {},
        logger: silent,
        transport: { isConnected: () => true },
        transportFt: { isConnected: () => false },
        helperInjector: { reinject: async () => ({ injected: [], skipped: [] }) }
    } as unknown as AdminCommandDeps;
    const op = buildAdminCommandOperations(deps).find(o => o.name === "admin-command")!;
    const r = await executeOperation(op, { input: { channel: "get-private-api-status" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    const d = r.data as Record<string, unknown>;
    assert.equal(d.connected, true);
    assert.equal(d.enabled, true);
    assert.equal(d.ft_connected, false);
    assert.equal(d.ft_enabled, false);
});

test("reinject-helper is local-admin-only and invokes the injector", async () => {
    const store = new InMemoryConfigStore();
    let called = 0;
    const deps = {
        configService: new ConfigService(store, new EventBus(), silent),
        configStore: store,
        version: "2.0.0",
        emit: () => {},
        logger: silent,
        transport: { isConnected: () => false },
        transportFt: { isConnected: () => false },
        helperInjector: {
            reinject: async () => {
                called += 1;
                return { injected: ["Messages"], skipped: ["FaceTime"] };
            }
        }
    } as unknown as AdminCommandDeps;
    const op = buildAdminCommandOperations(deps).find(o => o.name === "admin-command")!;
    // A remote password caller is denied (the gate fires before the handler).
    const denied = await executeOperation(op, { input: { channel: "reinject-helper" }, credential: "pw" }, ctx, auth);
    assert.equal(denied.status, 403);
    assert.equal(denied.error?.type, "admin_only");
    assert.equal(called, 0);
    // The trusted local channel runs it.
    const ok = await executeOperation(op, { input: { channel: "reinject-helper" }, trusted: true }, ctx, auth);
    assert.equal(ok.status, 200);
    assert.equal(called, 1);
    const d = ok.data as Record<string, unknown>;
    assert.equal(d.success, true);
    assert.deepEqual(d.injected, ["Messages"]);
    assert.deepEqual(d.skipped, ["FaceTime"]);
});

test("get-config (read) is allowed via password and never leaks secrets (audit F9/F15)", async () => {
    const { op, configService } = setup();
    await configService.update({ password: "super-secret-pw" });
    const r = await executeOperation(op, { input: { channel: "get-config" }, credential: "pw" }, ctx, auth);
    assert.equal(r.status, 200);
    assert.equal((r.data as Record<string, unknown>)["password"], undefined, "password is stripped on read");
});
