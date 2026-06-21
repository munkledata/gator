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
const LOCAL_TOKEN = "local-trust-token-xyz";

function setup() {
    const store = new InMemoryConfigStore();
    const ops = buildCoreOperations({ configStore: store, version: "9.9.9", now: () => 1000 });
    const registry = new OperationRegistry().registerAll(ops);
    return { store, ops, registry };
}

function fastifyApp(registry: OperationRegistry) {
    const app = Fastify();
    mountFastify(app, registry, { logger: silent, auth: { password: PASSWORD, localToken: LOCAL_TOKEN } });
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
    // A remote caller needs the password.
    assert.equal(
        (await app.inject({ method: "GET", url: "/api/v1/config", remoteAddress: "203.0.113.5" })).statusCode,
        401
    );
    const ok = await app.inject({
        method: "GET",
        url: "/api/v1/config",
        headers: { authorization: `Bearer ${PASSWORD}` },
        remoteAddress: "203.0.113.5"
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().data.password, undefined, "password not leaked");
    await app.close();
});

test("trust is by local token, not source IP: a loopback caller without the token is rejected (audit S1)", async () => {
    const { registry } = setup();
    const app = fastifyApp(registry);
    // Loopback IP alone is NOT trusted (a same-host reverse proxy would forge it).
    assert.equal(
        (await app.inject({ method: "GET", url: "/api/v1/config", remoteAddress: "127.0.0.1" })).statusCode,
        401
    );
    // Presenting the per-boot local token is trusted without a password.
    const trusted = await app.inject({
        method: "GET",
        url: "/api/v1/config",
        headers: { "x-bbd-local-auth": LOCAL_TOKEN },
        remoteAddress: "203.0.113.5"
    });
    assert.equal(trusted.statusCode, 200);
    // A wrong token is not trusted.
    assert.equal(
        (await app.inject({ method: "GET", url: "/api/v1/config", headers: { "x-bbd-local-auth": "nope" } })).statusCode,
        401
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

function fakeSocketIo(handshake: Record<string, unknown>) {
    const handlers: Record<string, (data: unknown, ack?: (r: unknown) => void) => void> = {};
    const emitted: Array<{ event: string; data: unknown }> = [];
    let joined: string | null = null;
    let disconnected = false;
    const fakeSocket = {
        id: "sock-1",
        handshake: { address: "127.0.0.1", query: {}, headers: {}, auth: {}, ...handshake },
        on: (event: string, fn: (data: unknown, ack?: (r: unknown) => void) => void) => {
            handlers[event] = fn;
        },
        join: (room: string) => {
            joined = room;
        },
        emit: (event: string, data: unknown) => emitted.push({ event, data }),
        disconnect: () => {
            disconnected = true;
        }
    };
    const fakeIo = {
        on: (event: string, fn: (socket: unknown) => void) => {
            if (event === "connection") fn(fakeSocket);
        }
    };
    return { fakeIo, handlers, get joined() { return joined; }, get disconnected() { return disconnected; }, emitted };
}

test("Socket.IO adapter routes through the same core and acks the envelope", async () => {
    const { registry } = setup();
    const t = fakeSocketIo({ query: { password: PASSWORD } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mountSocket(t.fakeIo as any, registry, { logger: silent, auth: { password: PASSWORD } });
    assert.equal(t.joined, "authed", "authenticated socket joins the broadcast room");

    const acked = await new Promise<{ status: number; data?: unknown }>(resolve => {
        t.handlers["ping"]!({}, r => resolve(r as { status: number; data?: unknown }));
    });
    assert.equal(acked.status, 200);
    assert.deepEqual(acked.data, { pong: true });
});

test("Socket.IO connection without a credential is disconnected and never joins the room (audit S6)", () => {
    const { registry } = setup();
    const t = fakeSocketIo({ query: {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mountSocket(t.fakeIo as any, registry, { logger: silent, auth: { password: PASSWORD } });
    assert.equal(t.disconnected, true);
    assert.equal(t.joined, null, "rejected socket never joins the broadcast room");
    assert.equal(t.handlers["ping"], undefined, "no op handlers registered for a rejected socket");
});

test("Socket.IO connection with the local token is trusted (audit S1)", () => {
    const { registry } = setup();
    const t = fakeSocketIo({ auth: { localAuth: LOCAL_TOKEN } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mountSocket(t.fakeIo as any, registry, { logger: silent, auth: { password: PASSWORD, localToken: LOCAL_TOKEN } });
    assert.equal(t.disconnected, false);
    assert.equal(t.joined, "authed");
});

test("server-info returns version aliases and feature/proxy flags", async () => {
    const { registry } = setup();
    const app = fastifyApp(registry);
    const res = await app.inject({
        method: "GET",
        url: "/api/v1/server/info",
        headers: { authorization: `Bearer ${PASSWORD}` },
        remoteAddress: "203.0.113.5"
    });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.version, "9.9.9");
    assert.equal(data.server_version, "9.9.9", "app reads server_version");
    assert.equal(data.private_api, false);
    assert.equal(data.proxy_service, null, "tunnelProvider 'none' maps to null");
    assert.equal(data.supports_header_auth, true);
    await app.close();
});

test("server-info surfaces an active proxy + enabled private API", async () => {
    const store = new InMemoryConfigStore({ enablePrivateApi: true, tunnelProvider: "zrok" });
    const ops = buildCoreOperations({ configStore: store, version: "9.9.9", now: () => 1000 });
    const registry = new OperationRegistry().registerAll(ops);
    const app = fastifyApp(registry);
    const res = await app.inject({
        method: "GET",
        url: "/api/v1/server/info",
        headers: { authorization: `Bearer ${PASSWORD}` },
        remoteAddress: "203.0.113.5"
    });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.private_api, true);
    assert.equal(data.proxy_service, "zrok");
    await app.close();
});

test("generateOpenApi derives paths, params, and security from the registry", () => {
    const { registry } = setup();
    const doc = generateOpenApi(registry, { title: "Gator", version: "2.0" }) as Record<string, any>;
    assert.equal(doc.openapi, "3.1.0");
    assert.ok(doc.paths["/api/v1/ping"].get);
    assert.ok(doc.paths["/api/v1/devices"].post.requestBody, "POST has a request body schema");
    assert.ok(doc.paths["/api/v1/devices/{id}"].delete, "':id' converted to '{id}'");
    assert.deepEqual(doc.paths["/api/v1/config"].get.security, [{ apiKey: [] }]);
    assert.deepEqual(doc.paths["/api/v1/ping"].get.security, []);
});
