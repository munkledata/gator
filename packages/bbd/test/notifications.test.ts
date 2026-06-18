import { test } from "node:test";
import assert from "node:assert/strict";
import { UnifiedPushProvider, type FetchLike } from "../src/notifications/UnifiedPushProvider";
import { NotificationRegistry } from "../src/notifications/NotificationRegistry";
import { buildNotificationRegistry } from "../src/notifications/buildNotificationRegistry";
import { NotificationsConfigSchema } from "../src/config/configSchema";
import { createConsoleLogger } from "../src/core/logger";
import type { Device, NotificationPayload, UnifiedPushDevice } from "../src/notifications/types";

const silent = createConsoleLogger("test", { level: "fatal" });
const payload: NotificationPayload = { type: "new-message", data: { guid: "x" }, priority: "high" };

test("UnifiedPushProvider POSTs the payload to the device endpoint", async () => {
    const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
    const fakeFetch: FetchLike = async (url, init) => {
        calls.push({ url, body: init.body, headers: init.headers });
        return { ok: true, status: 200 };
    };
    const provider = new UnifiedPushProvider(fakeFetch);
    const device: UnifiedPushDevice = {
        id: "d1",
        name: "Phone",
        provider: "unifiedpush",
        endpoint: "https://ntfy.sh/abc",
        createdAt: 0
    };
    const r = await provider.send(device, payload);
    assert.equal(r.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://ntfy.sh/abc");
    assert.equal(calls[0]!.headers["Urgency"], "high");
    assert.deepEqual(JSON.parse(calls[0]!.body), { type: "new-message", data: { guid: "x" } });
});

test("UnifiedPushProvider reports a non-2xx response as err", async () => {
    const provider = new UnifiedPushProvider(async () => ({ ok: false, status: 503 }));
    const device: UnifiedPushDevice = { id: "d", name: "n", provider: "unifiedpush", endpoint: "https://x", createdAt: 0 };
    assert.equal((await provider.send(device, payload)).ok, false);
});

test("registry routes each device to its provider; unknown provider is reported, not thrown", async () => {
    const registry = new NotificationRegistry(silent);
    let sent = 0;
    registry.register(
        new UnifiedPushProvider(async () => {
            sent++;
            return { ok: true, status: 200 };
        })
    );
    const devices: Device[] = [
        { id: "a", name: "a", provider: "unifiedpush", endpoint: "https://a", createdAt: 0 },
        { id: "b", name: "b", provider: "fcm", token: "tok", createdAt: 0 } // no fcm provider registered
    ];
    const results = await registry.dispatch(devices, payload);
    assert.equal(sent, 1);
    assert.equal(results.find(r => r.device.id === "a")!.result.ok, true);
    assert.equal(results.find(r => r.device.id === "b")!.result.ok, false);
});

test("buildNotificationRegistry: UnifiedPush is the default and is registered", () => {
    const config = NotificationsConfigSchema.parse({});
    assert.equal(config.defaultProvider, "unifiedpush");
    const registry = buildNotificationRegistry(config, silent);
    assert.equal(registry.has("unifiedpush"), true);
    assert.equal(registry.has("fcm"), false);
});

test("buildNotificationRegistry: FCM registered only when enabled AND a transport is supplied", () => {
    const config = NotificationsConfigSchema.parse({ fcm: { enabled: true } });
    assert.equal(buildNotificationRegistry(config, silent).has("fcm"), false);
    assert.equal(buildNotificationRegistry(config, silent, { fcm: async () => {} }).has("fcm"), true);
});
