import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { OperationRegistry } from "../src/api/registry";
import { buildCoreOperations } from "../src/api/operations/coreOperations";
import { mountFastify } from "../src/api/fastifyAdapter";
import { mountSocket } from "../src/api/socketAdapter";
import { executeOperation } from "../src/api/execute";
import { generateOpenApi } from "../src/api/openapi";
import { InMemoryConfigStore } from "../src/data/config-db/ConfigStore";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const PASSWORD = "secret";

function setup() {
    const store = new InMemoryConfigStore();
    const ops = buildCoreOperations({ configStore: store, version: "9.9.9", now: () => 1000 });
    const registry = new OperationRegistry().registerAll(ops);
    return { store, ops, registry };
}

function fastifyApp(registry: OperationRegistry) {
    const app = Fastify();
    mountFastify(app, registry, { logger: silent, auth: { password: PASSWORD } });
    return app;
}

test("registry rejects duplicate operations", () => {
    const { ops } = setup();
    const reg = new OperationRegistry().registerAll(ops);
    assert.throws(() => reg.register(ops[0]!), /duplicate operation/);
});

test("GET /api/v1/ping -> 200 success envelope, no auth", async () => {
    const { registry } = setup();
    const app = fastifyApp(registry);
    const res = await app.inject({ method: "GET", url: "/api/v1/ping" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 200, message: "Success", data: { pong: true } });
    await app.close();
});

test("auth-gated route: 401 without password, 200 with; config strips secrets", async () => {
    const { registry } = setup();
    const app = fastifyApp(registry);
    // A non-loopback caller (remote, over the tunnel) needs the password.
    assert.equal(
        (await app.inject({ method: "GET", url: "/api/v1/config", remoteAddress: "203.0.113.5" })).statusCode,
        401
    );
    const ok = await app.inject({ method: "GET", url: `/api/v1/config?password=${PASSWORD}`, remoteAddress: "203.0.113.5" });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().data.password, undefined, "password not leaked");
    // A loopback caller (the local admin UI) is trusted without the password.
    assert.equal(
        (await app.inject({ method: "GET", url: "/api/v1/config", remoteAddress: "127.0.0.1" })).statusCode,
        200
    );
    await app.close();
});

test("register-device validates the provider discriminated union and persists", async () => {
    const { store, registry } = setup();
    const app = fastifyApp(registry);
    const bad = await app.inject({
        method: "POST",
        url: `/api/v1/devices?password=${PASSWORD}`,
        payload: { name: "P", provider: "fcm" } // missing token
    });
    assert.equal(bad.statusCode, 400);
    const ok = await app.inject({
        method: "POST",
        url: `/api/v1/devices?password=${PASSWORD}`,
        payload: { name: "Phone", provider: "fcm", token: "fcm-token-abc" }
    });
    assert.equal(ok.statusCode, 200);
    assert.equal((await store.listDevices()).length, 1);
    await app.close();
});

test("REST and the shared core produce a byte-identical envelope", async () => {
    const { ops, registry } = setup();
    const app = fastifyApp(registry);
    const direct = await executeOperation(ops.find(o => o.name === "ping")!, { input: {} }, { logger: silent }, { password: PASSWORD });
    const viaRest = (await app.inject({ method: "GET", url: "/api/v1/ping" })).json();
    assert.deepEqual(viaRest, direct);
    await app.close();
});

test("Socket.IO adapter routes through the same core and acks the envelope", async () => {
    const { registry } = setup();
    const handlers: Record<string, (data: unknown, ack?: (r: unknown) => void) => void> = {};
    const fakeSocket = {
        handshake: { query: { password: PASSWORD }, address: "127.0.0.1" },
        on: (event: string, fn: (data: unknown, ack?: (r: unknown) => void) => void) => {
            handlers[event] = fn;
        }
    };
    const fakeIo = {
        on: (event: string, fn: (socket: unknown) => void) => {
            if (event === "connection") fn(fakeSocket);
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mountSocket(fakeIo as any, registry, { logger: silent, auth: { password: PASSWORD } });

    const acked = await new Promise<{ status: number; data?: unknown }>(resolve => {
        handlers["ping"]!({}, r => resolve(r as { status: number; data?: unknown }));
    });
    assert.equal(acked.status, 200);
    assert.deepEqual(acked.data, { pong: true });
});

test("generateOpenApi derives paths, params, and security from the registry", () => {
    const { registry } = setup();
    const doc = generateOpenApi(registry, { title: "BlueBubbles", version: "2.0" }) as Record<string, any>;
    assert.equal(doc.openapi, "3.1.0");
    assert.ok(doc.paths["/api/v1/ping"].get);
    assert.ok(doc.paths["/api/v1/devices"].post.requestBody, "POST has a request body schema");
    assert.ok(doc.paths["/api/v1/devices/{id}"].delete, "':id' converted to '{id}'");
    assert.deepEqual(doc.paths["/api/v1/config"].get.security, [{ apiKey: [] }]);
    assert.deepEqual(doc.paths["/api/v1/ping"].get.security, []);
});
