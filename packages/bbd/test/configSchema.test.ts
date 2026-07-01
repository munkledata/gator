import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, parseConfig, parseConfigSafe } from "../src/config/configSchema";

test("FCM is the default push provider", () => {
    assert.equal(DEFAULT_CONFIG.notifications.defaultProvider, "fcm");
    assert.equal(DEFAULT_CONFIG.notifications.fcm.enabled, true);
    assert.equal(DEFAULT_CONFIG.notifications.webpush.enabled, false);
});

test("parsing an empty object yields every default", () => {
    const c = parseConfig({});
    assert.equal(c.socketPort, 1234);
    assert.equal(c.enablePrivateApi, false);
    assert.equal(c.tunnelProvider, "none");
    assert.equal(c.notifications.defaultProvider, "fcm");
});

test("FaceTime Private API defaults off and round-trips", () => {
    assert.equal(DEFAULT_CONFIG.enableFtPrivateApi, false);
    assert.equal(parseConfig({}).enableFtPrivateApi, false);
    assert.equal(parseConfig({ enableFtPrivateApi: true }).enableFtPrivateApi, true);
});

test("invalid values are rejected", () => {
    assert.equal(parseConfigSafe({ socketPort: 70000 }).success, false);
    assert.equal(parseConfigSafe({ notifications: { defaultProvider: "telegram" } }).success, false);
    assert.equal(parseConfigSafe({ tunnelProvider: "wireguard" }).success, false);
});

test("valid overrides apply; unspecified sub-keys keep their defaults", () => {
    const c = parseConfig({
        socketPort: 8080,
        notifications: { defaultProvider: "webpush", webpush: { enabled: true } }
    });
    assert.equal(c.socketPort, 8080);
    assert.equal(c.notifications.defaultProvider, "webpush");
    assert.equal(c.notifications.webpush.enabled, true);
    assert.equal(c.notifications.fcm.enabled, true);
});

test("legacy config persisted with the removed UnifiedPush provider loads instead of crashing", () => {
    // An earlier build stored defaultProvider "unifiedpush" + a unifiedpush sub-object;
    // the preprocess remaps it to FCM and drops the dead key rather than failing the enum.
    const c = parseConfig({ notifications: { defaultProvider: "unifiedpush", unifiedpush: { enabled: true } } });
    assert.equal(c.notifications.defaultProvider, "fcm");
    assert.equal("unifiedpush" in c.notifications, false);
});

test("a legacy tunnelProvider of 'cloudflare' (removed option) coerces to 'none' instead of crashing", () => {
    const c = parseConfig({ tunnelProvider: "cloudflare" });
    assert.equal(c.tunnelProvider, "none");
    assert.equal(parseConfigSafe({ tunnelProvider: "cloudflare" }).success, true);
});

test("the FCM service account round-trips through the schema", () => {
    const account = { project_id: "p", client_email: "a@b.iam", private_key: "KEY" };
    const c = parseConfig({ notifications: { fcm: { enabled: true, serviceAccount: account } } });
    assert.deepEqual(c.notifications.fcm.serviceAccount, account);
});
