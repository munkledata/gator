import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { StaticHostnameProvider, ManagedTunnelProvider } from "../src/networking/TunnelProvider";
import { WebhookDispatcher, type WebhookFetch } from "../src/networking/webhook";
import { generatePkce, buildAuthorizationUrl, buildTokenExchangeBody } from "../src/networking/oauthPkce";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const noSleep = async () => {};

test("StaticHostnameProvider reports a fixed, always-connected URL", async () => {
    const p = new StaticHostnameProvider("https://bb.example.com");
    assert.deepEqual(await p.start(), { url: "https://bb.example.com", connected: true });
    assert.equal(p.status().connected, true);
});

test("ManagedTunnelProvider acquires a URL via its launcher and tears down", async () => {
    let stopped = false;
    const p = new ManagedTunnelProvider("fake", async () => ({
        url: "https://abc123.trycloudflare.com",
        stop: async () => void (stopped = true)
    }));
    assert.equal(p.status().connected, false);
    const s = await p.start();
    assert.equal(s.url, "https://abc123.trycloudflare.com");
    await p.stop();
    assert.equal(stopped, true);
    assert.equal(p.status().connected, false);
});

test("webhook signs the body with HMAC-SHA256 when a secret is set", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    const fetchImpl: WebhookFetch = async (_url, init) => {
        seen = init;
        return { ok: true, status: 200 };
    };
    const wh = new WebhookDispatcher({ logger: silent, fetch: fetchImpl, sleep: noSleep });
    const ok = await wh.dispatch({ url: "https://hook.example.com", secret: "shh" }, { type: "new-message", data: { a: 1 } });
    assert.equal(ok, true);
    const expected = "sha256=" + createHmac("sha256", "shh").update(seen!.body).digest("hex");
    assert.equal(seen!.headers["X-BB-Signature"], expected);
});

test("webhook refuses a target rejected by the SSRF allow-list", async () => {
    let called = false;
    const wh = new WebhookDispatcher({
        logger: silent,
        fetch: async () => {
            called = true;
            return { ok: true, status: 200 };
        },
        allow: url => url.startsWith("https://"),
        sleep: noSleep
    });
    assert.equal(await wh.dispatch({ url: "http://169.254.169.254/" }, { type: "x", data: {} }), false);
    assert.equal(called, false);
});

test("webhook retries and eventually succeeds", async () => {
    let attempts = 0;
    const wh = new WebhookDispatcher({
        logger: silent,
        maxRetries: 3,
        sleep: noSleep,
        fetch: async () => {
            attempts++;
            return { ok: attempts >= 3, status: attempts >= 3 ? 200 : 500 };
        }
    });
    assert.equal(await wh.dispatch({ url: "https://h" }, { type: "x", data: {} }), true);
    assert.equal(attempts, 3);
});

test("PKCE: challenge is base64url(SHA-256(verifier)); auth URL uses S256", () => {
    const { verifier, challenge } = generatePkce();
    assert.match(verifier, /^[A-Za-z0-9_-]+$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(challenge, expected);

    const url = new URL(
        buildAuthorizationUrl({
            authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
            clientId: "cid",
            redirectUri: "http://localhost:1234/cb",
            scope: "email",
            challenge,
            state: "st8"
        })
    );
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("code_challenge"), challenge);
    assert.equal(url.searchParams.get("response_type"), "code");

    const body = new URLSearchParams(buildTokenExchangeBody({
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        clientId: "cid",
        redirectUri: "http://localhost:1234/cb",
        code: "abc",
        verifier
    }));
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code_verifier"), verifier);
});
