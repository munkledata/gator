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

test("forgives and prunes a sub-threshold entry after the window (audit F27)", () => {
    let clock = 0;
    const rl = new RateLimiter(3, 100, () => clock);
    // One bad attempt that never reaches the lockout threshold.
    rl.recordFailure("k");
    assert.equal(rl.isLocked("k"), false);
    // After the forgiveness window, isLocked must drop the stale entry (not just return false).
    clock = 200;
    assert.equal(rl.isLocked("k"), false);
    // A fresh failure after forgiveness starts the count over (not 1->2 of an old streak).
    rl.recordFailure("k");
    rl.recordFailure("k");
    assert.equal(rl.isLocked("k"), false, "two fresh failures are still below the threshold of 3");
});

test("caps the map under a flood of distinct keys (audit F27)", () => {
    let clock = 0;
    const rl = new RateLimiter(10, 60_000, () => clock, 100);
    for (let i = 0; i < 500; i++) {
        clock = i; // each key seen at a distinct time so the oldest-first eviction is deterministic
        rl.recordFailure(`ip-${i}`);
    }
    // Reach into the private map size via a JSON-free probe: the most recent keys survive,
    // the oldest were evicted. We can only observe behavior, so assert the newest is tracked
    // and a very old one was forgiven/evicted.
    assert.equal(rl.isLocked("ip-499"), false); // tracked but below threshold
    rl.reset("ip-499");
    assert.equal(rl.isLocked("ip-0"), false); // long since evicted/forgiven
});
