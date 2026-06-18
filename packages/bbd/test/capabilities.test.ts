import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMacOSVersion, computeCapabilities } from "../src/host-platform/capabilities";

test("maps Darwin release strings to macOS versions", () => {
    assert.equal(detectMacOSVersion("25.5.0").major, 26);
    assert.equal(detectMacOSVersion("25.5.0").name, "Tahoe");
    assert.equal(detectMacOSVersion("24.0.0").major, 15);
    assert.equal(detectMacOSVersion("24.0.0").name, "Sequoia");
    assert.equal(detectMacOSVersion("22.6.0").major, 13);
    assert.equal(detectMacOSVersion("22.6.0").name, "Ventura");
    assert.equal(detectMacOSVersion("20.0.0").major, 11);
    assert.equal(detectMacOSVersion("20.0.0").name, "Big Sur");
});

test("maps legacy 10.x Darwin releases", () => {
    const v = detectMacOSVersion("19.6.0");
    assert.equal(v.major, 10);
    assert.equal(v.minor, 15);
});

test("derives version-gated features from the major", () => {
    const tahoe = computeCapabilities({ version: detectMacOSVersion("25.5.0") });
    assert.equal(tahoe.supportsEditMessage, true); // 13+
    assert.equal(tahoe.supportsMarkUnread, true);
    assert.equal(tahoe.supportsReplies, true);

    const bigSur = computeCapabilities({ version: detectMacOSVersion("20.0.0") });
    assert.equal(bigSur.supportsReplies, true); // 11+
    assert.equal(bigSur.supportsEditMessage, false); // needs 13+
    assert.equal(bigSur.supportsFocusStatus, false); // needs 12+
});

test("injectionViable is a separate (SIP) input, defaulting to false", () => {
    assert.equal(computeCapabilities({ version: detectMacOSVersion("25.5.0") }).injectionViable, false);
    assert.equal(
        computeCapabilities({ version: detectMacOSVersion("25.5.0"), injectionViable: true }).injectionViable,
        true
    );
});
