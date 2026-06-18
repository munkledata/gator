import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEqual, RateLimiter } from "../src/api/auth";

test("safeEqual compares correctly (incl. unequal lengths)", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
    assert.equal(safeEqual("", ""), true);
    assert.equal(safeEqual("secret", ""), false);
});

test("RateLimiter locks after max failures and expires", () => {
    let clock = 0;
    const rl = new RateLimiter(3, 100, () => clock);
    assert.equal(rl.isLocked("k"), false);
    rl.recordFailure("k");
    rl.recordFailure("k");
    assert.equal(rl.isLocked("k"), false, "below threshold");
    rl.recordFailure("k");
    assert.equal(rl.isLocked("k"), true, "locked at threshold");

    clock = 150;
    assert.equal(rl.isLocked("k"), false, "lockout window elapsed");
});

test("reset clears the failure count", () => {
    const rl = new RateLimiter(1, 100, () => 0);
    rl.recordFailure("k");
    assert.equal(rl.isLocked("k"), true);
    rl.reset("k");
    assert.equal(rl.isLocked("k"), false);
});

test("limiter is per-key", () => {
    const rl = new RateLimiter(1, 100, () => 0);
    rl.recordFailure("a");
    assert.equal(rl.isLocked("a"), true);
    assert.equal(rl.isLocked("b"), false);
});
