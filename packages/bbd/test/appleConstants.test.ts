import { test } from "node:test";
import assert from "node:assert/strict";
import {
    COCOA_EPOCH_UNIX_MS,
    appleDateToUnixMs,
    unixMsToAppleNanos,
    REACTION_TYPES,
    isReaction
} from "../src/data/imessage/appleConstants";

test("Cocoa epoch is 2001-01-01T00:00:00Z", () => {
    assert.equal(COCOA_EPOCH_UNIX_MS, Date.UTC(2001, 0, 1));
});

test("appleDateToUnixMs handles nanosecond timestamps (modern macOS)", () => {
    // 2001-01-01 + 1e9 ns (= 1 second) -> epoch + 1000 ms
    assert.equal(appleDateToUnixMs(1_000_000_000, "nanoseconds"), COCOA_EPOCH_UNIX_MS + 1000);
    // auto-detects a large value as nanoseconds
    const nowNanos = unixMsToAppleNanos(Date.UTC(2026, 0, 1));
    assert.equal(appleDateToUnixMs(nowNanos), Date.UTC(2026, 0, 1));
});

test("appleDateToUnixMs handles legacy second timestamps", () => {
    assert.equal(appleDateToUnixMs(60, "seconds"), COCOA_EPOCH_UNIX_MS + 60_000);
    assert.equal(appleDateToUnixMs(60), COCOA_EPOCH_UNIX_MS + 60_000); // auto: small -> seconds
});

test("appleDateToUnixMs returns null for the 0/absent sentinel", () => {
    assert.equal(appleDateToUnixMs(0), null);
    assert.equal(appleDateToUnixMs(null), null);
    assert.equal(appleDateToUnixMs(undefined), null);
});

test("reaction code mapping", () => {
    assert.equal(REACTION_TYPES[2000], "love");
    assert.equal(REACTION_TYPES[3000], "-love");
    assert.equal(isReaction(2003), true);
    assert.equal(isReaction(0), false);
    assert.equal(isReaction(null), false);
});
