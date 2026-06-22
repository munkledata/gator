import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { executeOperation, AdminOnlyError } from "../src/api/execute";
import { defineOperation } from "../src/api/Operation";
import { RateLimiter } from "../src/api/auth";
import { createConsoleLogger } from "../src/core/logger";

const ctx = { logger: createConsoleLogger("t", { level: "fatal" }) };

const echo = defineOperation({
    name: "echo",
    method: "POST",
    path: "/echo",
    auth: true,
    input: z.object({ msg: z.string() }),
    handler: (_c, i) => ({ echoed: i.msg })
});

const openPing = defineOperation({
    name: "ping",
    method: "GET",
    path: "/ping",
    auth: false,
    input: z.object({}).passthrough(),
    handler: () => ({ ok: true })
});

test("no-auth operation runs and wraps the result in a success envelope", async () => {
    const r = await executeOperation(openPing, { input: {} }, ctx, { password: "x" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true });
});

test("auth operation: missing or wrong credential -> 401", async () => {
    assert.equal((await executeOperation(echo, { input: { msg: "hi" } }, ctx, { password: "pw" })).status, 401);
    assert.equal(
        (await executeOperation(echo, { input: { msg: "hi" }, credential: "wrong" }, ctx, { password: "pw" })).status,
        401
    );
});

test("auth operation: correct credential + valid input -> 200", async () => {
    const r = await executeOperation(echo, { input: { msg: "hi" }, credential: "pw" }, ctx, { password: "pw" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { echoed: "hi" });
});

test("invalid input -> 400 with a validation error", async () => {
    const r = await executeOperation(echo, { input: { msg: 123 }, credential: "pw" }, ctx, { password: "pw" });
    assert.equal(r.status, 400);
    assert.equal(r.error?.type, "validation");
});

test("a throwing handler -> 500", async () => {
    const boom = defineOperation({
        name: "boom",
        method: "GET",
        path: "/boom",
        auth: false,
        input: z.object({}).passthrough(),
        handler: () => {
            throw new Error("kaboom");
        }
    });
    assert.equal((await executeOperation(boom, { input: {} }, ctx, { password: "x" })).status, 500);
});

test("rate limiter locks after repeated failures -> 403 even with a good credential", async () => {
    const rl = new RateLimiter(2, 1000, () => 0);
    const auth = { password: "pw", rateLimiter: rl };
    await executeOperation(echo, { input: { msg: "x" }, credential: "bad", rateLimitKey: "ip" }, ctx, auth);
    await executeOperation(echo, { input: { msg: "x" }, credential: "bad", rateLimitKey: "ip" }, ctx, auth);
    const locked = await executeOperation(echo, { input: { msg: "x" }, credential: "pw", rateLimitKey: "ip" }, ctx, auth);
    assert.equal(locked.status, 403);
});

test("adminOnly op rejects the shared-password path but accepts the trusted local channel (audit F15)", async () => {
    const adminOp = defineOperation({
        name: "destroy",
        method: "POST",
        path: "/destroy",
        auth: true,
        adminOnly: true,
        input: z.object({}).passthrough(),
        handler: () => ({ destroyed: true })
    });
    // Correct password but NOT the trusted local channel -> 403 (admin_only), never runs.
    const denied = await executeOperation(adminOp, { input: {}, credential: "pw" }, ctx, { password: "pw" });
    assert.equal(denied.status, 403);
    assert.equal(denied.error?.type, "admin_only");
    // Trusted local channel -> allowed.
    const ok = await executeOperation(adminOp, { input: {}, trusted: true }, ctx, { password: "pw" });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { destroyed: true });
});

test("a handler throwing AdminOnlyError maps to a 403 (not 500) (audit F15)", async () => {
    const op = defineOperation({
        name: "dispatch",
        method: "POST",
        path: "/dispatch",
        auth: true,
        input: z.object({}).passthrough(),
        handler: (c: { trusted?: boolean }) => {
            if (!c.trusted) throw new AdminOnlyError('channel "x" requires local access');
            return { ok: true };
        }
    });
    const denied = await executeOperation(op, { input: {}, credential: "pw" }, ctx, { password: "pw" });
    assert.equal(denied.status, 403);
    assert.equal(denied.error?.type, "admin_only");
});
