import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { startBbdBackend } from "../src/backend";
import { DrizzleConfigStore } from "../src/data/config-db/DrizzleConfigStore";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });

const hasOpenssl = (() => {
    try {
        execFileSync("openssl", ["version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

/** GET over HTTPS, ignoring the self-signed cert (we only verify the listener serves TLS). */
function httpsGet(url: string): Promise<{ status: number }> {
    return new Promise(resolve => {
        https
            .get(url, { rejectUnauthorized: false }, res => {
                res.resume();
                resolve({ status: res.statusCode ?? 0 });
            })
            .on("error", () => resolve({ status: 0 }));
    });
}

/**
 * Boots the REAL composition root (startBbdBackend) over a real loopback socket and
 * exercises the wired auth, not just components in isolation — the gap the audit flagged
 * (no test imported backend.ts, so "tested but never mounted" controls were invisible).
 */
test("composition root boots; ping/health open, password + local-token trusted, anon rejected", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-smoke-"));
    const running = await startBbdBackend({
        userDataPath: dir,
        messagesDir: path.join(dir, "no-messages"), // absent chat.db -> read path degrades gracefully
        port: 0, // OS-assigned free port
        password: "smoke-pass-123",
        localAuthToken: "smoke-local-token",
        logger: silent
    });
    try {
        const base = `http://127.0.0.1:${running.port}`;

        // Liveness probes are open.
        assert.equal((await fetch(`${base}/api/v1/ping`)).status, 200);
        const health = (await (await fetch(`${base}/api/v1/health`)).json()) as { ok: boolean; degraded: boolean };
        assert.equal(health.ok, true);
        assert.equal(health.degraded, true, "read path degraded without chat.db");

        // Auth-gated op: anonymous -> 401.
        assert.equal((await fetch(`${base}/api/v1/config`)).status, 401);
        // Loopback IP alone is NOT trusted (audit S1).
        // (the request above already came from 127.0.0.1 and still got 401)

        // Correct password (Bearer header) -> 200, secrets stripped.
        const withPw = await fetch(`${base}/api/v1/config`, { headers: { authorization: "Bearer smoke-pass-123" } });
        assert.equal(withPw.status, 200);
        const cfg = (await withPw.json()) as { data: Record<string, unknown> };
        assert.equal(cfg.data.password, undefined, "password not leaked");

        // Local-trust token -> 200 without a password.
        const withTok = await fetch(`${base}/api/v1/config`, { headers: { "x-bbd-local-auth": "smoke-local-token" } });
        assert.equal(withTok.status, 200);
    } finally {
        await running.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("misconfigured Let's Encrypt (no email) falls back to self-signed instead of crashing the daemon", { skip: hasOpenssl ? false : "openssl not available" }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-tlsfallback-"));
    const tlsPort = 18445;
    try {
        // tlsMode=letsencrypt with no acmeEmail/domain — issuance must fail, but boot must not.
        await new DrizzleConfigStore(path.join(dir, "config.db")).setConfig({
            tlsEnabled: true,
            tlsMode: "letsencrypt",
            tlsPort
        });
        const running = await startBbdBackend({
            userDataPath: dir,
            messagesDir: path.join(dir, "no-messages"),
            port: 0,
            password: "smoke-pass-123",
            logger: silent
        });
        try {
            // Daemon booted (no throw) and the HTTPS listener is up on the self-signed fallback.
            assert.equal((await httpsGet(`https://127.0.0.1:${tlsPort}/api/v1/ping`)).status, 200);
        } finally {
            await running.stop();
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("built-in TLS listener serves HTTPS when enabled (audit S4 / restored self-signed cert)", { skip: hasOpenssl ? false : "openssl not available" }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-tls-"));
    const tlsPort = 18443;
    try {
        // Pre-seed config so the daemon brings up the TLS listener on boot.
        await new DrizzleConfigStore(path.join(dir, "config.db")).setConfig({ tlsEnabled: true, tlsPort });

        const running = await startBbdBackend({
            userDataPath: dir,
            messagesDir: path.join(dir, "no-messages"),
            port: 0,
            password: "smoke-pass-123",
            logger: silent
        });
        try {
            // ping is open and now answered over HTTPS on the TLS port.
            const ping = await httpsGet(`https://127.0.0.1:${tlsPort}/api/v1/ping`);
            assert.equal(ping.status, 200, "TLS listener answers ping over HTTPS");
            // auth still enforced on the TLS endpoint.
            const cfg = await httpsGet(`https://127.0.0.1:${tlsPort}/api/v1/config`);
            assert.equal(cfg.status, 401, "auth enforced over TLS");
        } finally {
            await running.stop();
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
