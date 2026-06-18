import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ok,
    err,
    isOk,
    isErr,
    map,
    mapErr,
    unwrapOr,
    attempt,
    attemptAsync,
    toError,
    type Result
} from "../src/core/result";

test("ok/err construct discriminated variants", () => {
    assert.deepEqual(ok(1), { ok: true, value: 1 });
    assert.deepEqual(err("boom"), { ok: false, error: "boom" });
    assert.equal(isOk(ok(1)), true);
    assert.equal(isErr(err("x")), true);
});

test("map transforms value, passes error through", () => {
    assert.deepEqual(map(ok(2), n => n * 3), ok(6));
    const e = err<string>("nope");
    assert.equal(map(e, (n: number) => n * 3), e);
});

test("mapErr transforms error, passes value through", () => {
    assert.deepEqual(mapErr(err("a"), s => s.toUpperCase()), err("A"));
    const v = ok(5);
    assert.equal(mapErr(v, () => "x"), v);
});

test("unwrapOr returns value or fallback", () => {
    assert.equal(unwrapOr(ok(10), 0), 10);
    const failed: Result<number, Error> = err(new Error("x"));
    assert.equal(unwrapOr(failed, 0), 0);
});

test("attempt captures throws as err", () => {
    assert.deepEqual(attempt(() => 42), ok(42));
    const r = attempt(() => {
        throw new Error("kaboom");
    });
    assert.equal(isErr(r), true);
    assert.equal((r as { error: Error }).error.message, "kaboom");
});

test("attemptAsync captures rejected promise as err", async () => {
    assert.deepEqual(await attemptAsync(async () => "ok"), ok("ok"));
    const r = await attemptAsync(async () => {
        throw "string-throw";
    });
    assert.equal(isErr(r), true);
    assert.equal((r as { error: Error }).error.message, "string-throw");
});

test("toError normalizes non-Error throws", () => {
    assert.ok(toError("x") instanceof Error);
    const e = new Error("keep");
    assert.equal(toError(e), e);
});
