import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeConfig } from "../src/config/sanitize";
import { parseConfig } from "../src/config/configSchema";

test("sanitizeConfig strips every plaintext credential (audit S3/S7)", () => {
    const config = parseConfig({
        password: "super-secret",
        cloudflareDdnsApiToken: "cf-token",
        zrok_token: "zrok-secret",
        serverAddress: "https://example.com",
        notifications: {
            defaultProvider: "fcm",
            fcm: {
                enabled: true,
                serviceAccount: { project_id: "p", client_email: "e", private_key: "PEM" },
                oauthClientId: "public-client-id.apps.googleusercontent.com",
                oauthClientSecret: "oauth-secret"
            },
            webpush: { enabled: true, vapidPublicKey: "PUB", vapidPrivateKey: "PRIV" }
        }
    });

    const safe = sanitizeConfig(config) as Record<string, any>;

    // Top-level secrets gone.
    assert.equal(safe.password, undefined);
    assert.equal(safe.cloudflareDdnsApiToken, undefined);
    assert.equal(safe.zrok_token, undefined);
    // Nested secrets gone.
    assert.equal(safe.notifications.fcm.serviceAccount, undefined);
    assert.equal(safe.notifications.fcm.oauthClientSecret, undefined);
    assert.equal(safe.notifications.webpush.vapidPrivateKey, undefined);

    // Non-secret fields preserved (incl. the public OAuth client id and VAPID public key).
    assert.equal(safe.serverAddress, "https://example.com");
    assert.equal(safe.notifications.fcm.enabled, true);
    assert.equal(safe.notifications.fcm.oauthClientId, "public-client-id.apps.googleusercontent.com");
    assert.equal(safe.notifications.webpush.vapidPublicKey, "PUB");
});
