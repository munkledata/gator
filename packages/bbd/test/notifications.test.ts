import { test } from "node:test";
import assert from "node:assert/strict";
import { FcmProvider, type FcmFetch, type FcmResponse } from "../src/notifications/FcmProvider";
import { parseServiceAccount } from "../src/notifications/fcm/serviceAccount";
import { NotificationRegistry } from "../src/notifications/NotificationRegistry";
import { buildNotificationRegistry } from "../src/notifications/buildNotificationRegistry";
import { NotificationsConfigSchema } from "../src/config/configSchema";
import { createConsoleLogger } from "../src/core/logger";
import type { Device, FcmDevice, NotificationPayload } from "../src/notifications/types";

const silent = createConsoleLogger("test", { level: "fatal" });
const payload: NotificationPayload = { type: "new-message", data: { guid: "x" }, priority: "high" };

const ACCOUNT = { project_id: "proj-1", client_email: "svc@proj-1.iam.gserviceaccount.com", private_key: "PEM" };
const creds = () => parseServiceAccount(ACCOUNT);
const fcmDevice: FcmDevice = { id: "d1", name: "Phone", provider: "fcm", token: "tok-123", createdAt: 0 };

/** A fake transport recording calls; returns a token for the OAuth endpoint and 200 for sends. */
function fakeTransport(sendStatus = 200) {
    const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
    let tokenMints = 0;
    const json = (v: unknown): FcmResponse => ({ ok: true, status: 200, text: async () => "", json: async () => v });
    const fetch: FcmFetch = async (url, init) => {
        calls.push({ url, body: init.body, headers: init.headers });
        if (url.includes("oauth2.googleapis.com/token")) {
            tokenMints++;
            return json({ access_token: `access-${tokenMints}`, expires_in: 3600 });
        }
        return { ok: sendStatus < 400, status: sendStatus, text: async () => "boom", json: async () => ({}) };
    };
    return { calls, fetch, tokenMints: () => tokenMints };
}

test("FcmProvider mints an OAuth token then POSTs a v1 data message", async () => {
    const t = fakeTransport();
    const provider = new FcmProvider({ credentials: creds, fetch: t.fetch, sign: () => "SIG", now: () => 0 });

    const r = await provider.send(fcmDevice, payload);
    assert.equal(r.ok, true);

    const token = t.calls.find(c => c.url.includes("oauth2.googleapis.com/token"))!;
    assert.ok(token.body.includes("grant_type=urn"));
    assert.ok(token.body.includes("assertion="));

    const send = t.calls.find(c => c.url.includes("fcm.googleapis.com/v1/projects/proj-1/messages:send"))!;
    assert.equal(send.headers["Authorization"], "Bearer access-1");
    const sent = JSON.parse(send.body);
    assert.equal(sent.message.token, "tok-123");
    assert.equal(sent.message.android.priority, "high");
    // Data-only message: legacy { type, data } shape, data stringified.
    assert.deepEqual(sent.message.data, { type: "new-message", data: JSON.stringify({ guid: "x" }) });
});

test("FcmProvider caches the access token across sends until it nears expiry", async () => {
    const t = fakeTransport();
    let clock = 0;
    const provider = new FcmProvider({ credentials: creds, fetch: t.fetch, sign: () => "SIG", now: () => clock });

    await provider.send(fcmDevice, payload);
    await provider.send(fcmDevice, payload);
    assert.equal(t.tokenMints(), 1, "second send reuses the cached token");

    clock = 3600_000; // jump past expiry (minus skew)
    await provider.send(fcmDevice, payload);
    assert.equal(t.tokenMints(), 2, "expired token is re-minted");
});

test("FcmProvider reports an unconfigured account and a non-2xx send as err", async () => {
    const t = fakeTransport(500);
    const unconfigured = new FcmProvider({ credentials: () => null, fetch: t.fetch, sign: () => "SIG" });
    assert.equal((await unconfigured.send(fcmDevice, payload)).ok, false);

    const failing = new FcmProvider({ credentials: creds, fetch: t.fetch, sign: () => "SIG", now: () => 0 });
    assert.equal((await failing.send(fcmDevice, payload)).ok, false);
});

test("parseServiceAccount accepts the JSON string or object, rejects junk", () => {
    assert.deepEqual(parseServiceAccount(JSON.stringify(ACCOUNT))?.projectId, "proj-1");
    assert.deepEqual(parseServiceAccount(ACCOUNT)?.clientEmail, ACCOUNT.client_email);
    assert.equal(parseServiceAccount(null), null);
    assert.equal(parseServiceAccount(""), null);
    assert.equal(parseServiceAccount("{not json"), null);
    assert.equal(parseServiceAccount({ project_id: "p" }), null); // missing fields
});

test("registry routes each device to its provider; unknown provider is reported, not thrown", async () => {
    const t = fakeTransport();
    const registry = new NotificationRegistry(silent);
    registry.register(new FcmProvider({ credentials: creds, fetch: t.fetch, sign: () => "SIG", now: () => 0 }));

    const devices: Device[] = [
        fcmDevice,
        // webpush isn't registered in this test, so device b can't be delivered
        { id: "b", name: "b", provider: "webpush", subscription: { endpoint: "https://b", keys: { p256dh: "x", auth: "y" } }, createdAt: 0 }
    ];
    const results = await registry.dispatch(devices, payload);
    assert.equal(results.find(r => r.device.id === "d1")!.result.ok, true);
    assert.equal(results.find(r => r.device.id === "b")!.result.ok, false);
});

test("buildNotificationRegistry: FCM is the default and is registered", () => {
    const config = NotificationsConfigSchema.parse({});
    assert.equal(config.defaultProvider, "fcm");
    const registry = buildNotificationRegistry(config, silent);
    assert.equal(registry.has("fcm"), true);
    assert.equal(registry.has("webpush"), false);
});

test("buildNotificationRegistry: Web Push registered only when enabled AND a transport is supplied", () => {
    const config = NotificationsConfigSchema.parse({ webpush: { enabled: true } });
    assert.equal(buildNotificationRegistry(config, silent).has("webpush"), false);
    assert.equal(buildNotificationRegistry(config, silent, { webpush: async () => {} }).has("webpush"), true);
});
