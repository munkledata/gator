import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, parseConfig, parseConfigSafe } from "../src/config/configSchema";

test("UnifiedPush is the default push provider", () => {
    assert.equal(DEFAULT_CONFIG.notifications.defaultProvider, "unifiedpush");
    assert.equal(DEFAULT_CONFIG.notifications.unifiedpush.enabled, true);
    assert.equal(DEFAULT_CONFIG.notifications.fcm.enabled, false);
    assert.equal(DEFAULT_CONFIG.notifications.webpush.enabled, false);
});

test("parsing an empty object yields every default", () => {
    const c = parseConfig({});
    assert.equal(c.socketPort, 1234);
    assert.equal(c.enablePrivateApi, false);
    assert.equal(c.tunnelProvider, "none");
    assert.equal(c.notifications.defaultProvider, "unifiedpush");
});

test("invalid values are rejected", () => {
    assert.equal(parseConfigSafe({ socketPort: 70000 }).success, false);
    assert.equal(parseConfigSafe({ notifications: { defaultProvider: "telegram" } }).success, false);
    assert.equal(parseConfigSafe({ tunnelProvider: "wireguard" }).success, false);
});

test("valid overrides apply; unspecified sub-keys keep their defaults", () => {
    const c = parseConfig({
        socketPort: 8080,
        notifications: { defaultProvider: "fcm", fcm: { enabled: true } }
    });
    assert.equal(c.socketPort, 8080);
    assert.equal(c.notifications.defaultProvider, "fcm");
    assert.equal(c.notifications.fcm.enabled, true);
    assert.equal(c.notifications.unifiedpush.enabled, true);
});
