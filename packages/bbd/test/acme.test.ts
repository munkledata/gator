import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto, { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
    generateAccountKeyPem,
    loadAccountKey,
    publicJwk,
    jwkThumbprint,
    signJws,
    dns01TxtValue,
    b64url
} from "../src/networking/acme/jws";
import { AcmeClient, type AcmeFetch } from "../src/networking/acme/AcmeClient";
import { CloudflareDns01, type CfFetch } from "../src/networking/CloudflareDns01";
import { AcmeService } from "../src/networking/AcmeService";
import { CertificateService } from "../src/networking/CertificateService";
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
const noSleep = async (): Promise<void> => undefined;

// ---------- JWS / thumbprint ----------

test("jwkThumbprint is stable and dns01TxtValue follows the RFC formula", () => {
    const key = loadAccountKey(generateAccountKeyPem());
    const jwk = publicJwk(key);
    const tp1 = jwkThumbprint(jwk);
    const tp2 = jwkThumbprint(publicJwk(key));
    assert.equal(tp1, tp2, "thumbprint is deterministic");
    assert.equal(tp1.length, 43, "sha256 base64url is 43 chars");

    const expected = b64url(createHash("sha256").update(`mytoken.${tp1}`).digest());
    assert.equal(dns01TxtValue("mytoken", tp1), expected);
});

test("signJws produces an ES256 signature verifiable with the public key", () => {
    const key = loadAccountKey(generateAccountKeyPem());
    const jwk = publicJwk(key);
    const jws = signJws({ key, url: "https://acme/x", nonce: "nonce1", jwk, payload: { hello: "world" } });
    assert.ok(jws.protected && jws.payload && jws.signature);
    const ok = crypto.verify(
        "sha256",
        Buffer.from(`${jws.protected}.${jws.payload}`),
        { key: crypto.createPublicKey(key), dsaEncoding: "ieee-p1363" },
        Buffer.from(jws.signature, "base64url")
    );
    assert.ok(ok, "signature verifies");
    // POST-as-GET => empty payload segment.
    assert.equal(signJws({ key, url: "u", nonce: "n", kid: "acct", payload: "" }).payload, "");
});

// ---------- A scripted ACME server over an injected fetch ----------

function makeAcmeFetch() {
    const base = "https://acme.test";
    const counts: Record<string, number> = {};
    const hit = (k: string): number => (counts[k] = (counts[k] ?? 0) + 1);
    const res = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        const h = new Map(Object.entries({ "replay-nonce": "nonce-" + Math.floor(performance.now()), ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
        const text = typeof body === "string" ? body : JSON.stringify(body);
        return { ok: status < 400, status, headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null }, json: async () => JSON.parse(text), text: async () => text };
    };
    const fetch: AcmeFetch = async (url, init) => {
        const method = init?.method ?? "GET";
        if (url.endsWith("/directory")) return res(200, { newNonce: `${base}/nonce`, newAccount: `${base}/acct`, newOrder: `${base}/order` });
        if (url.endsWith("/nonce") && method === "HEAD") return res(204, "");
        if (url.endsWith("/acct")) return res(201, { status: "valid" }, { location: `${base}/acct/1` });
        if (url.endsWith("/order")) return res(201, { status: "pending", authorizations: [`${base}/authz/1`], finalize: `${base}/finalize/1` }, { location: `${base}/order/1` });
        if (url.endsWith("/authz/1")) {
            // First call returns the challenge; subsequent polls return valid.
            return hit("authz") === 1
                ? res(200, { status: "pending", identifier: { value: "gator.example.com" }, challenges: [{ type: "dns-01", url: `${base}/chal/1`, token: "challtoken", status: "pending" }] })
                : res(200, { status: "valid" });
        }
        if (url.endsWith("/chal/1")) return res(200, { status: "pending" });
        if (url.endsWith("/finalize/1")) return res(200, { status: "processing" });
        if (url.endsWith("/order/1")) return res(200, { status: "valid", certificate: `${base}/cert/1` });
        if (url.endsWith("/cert/1")) return res(200, "-----BEGIN CERTIFICATE-----\nMIIFAKE\n-----END CERTIFICATE-----\n");
        return res(404, { detail: "not found" });
    };
    return { fetch, base };
}

test("AcmeClient drives directory -> account -> order -> dns-01 -> finalize -> cert", async () => {
    const { fetch } = makeAcmeFetch();
    const client = new AcmeClient({ fetch, accountKey: loadAccountKey(generateAccountKeyPem()), directoryUrl: "https://acme.test/directory" });

    const kid = await client.registerAccount("me@example.com");
    assert.match(kid, /acct\/1$/);
    const order = await client.newOrder(["gator.example.com"]);
    assert.equal(order.authorizations.length, 1);

    const { challenge, domain } = await client.getDns01Challenge(order.authorizations[0]!);
    assert.equal(challenge.type, "dns-01");
    assert.equal(domain, "gator.example.com");
    assert.equal(client.dns01Value(challenge.token).length, 43);

    await client.submitChallenge(challenge.url);
    const authz = await client.pollStatus(order.authorizations[0]!, { sleep: noSleep });
    assert.equal(authz.status, "valid");

    const finalOrder = await (async () => {
        await client.finalize(order.finalize, "Zm9v");
        return client.pollStatus(order.url, { sleep: noSleep });
    })();
    assert.equal(finalOrder.status, "valid");
    const pem = await client.downloadCertificate(finalOrder.certificate);
    assert.match(pem, /BEGIN CERTIFICATE/);
});

// ---------- Cloudflare DNS-01 ----------

function makeCfFetch() {
    const calls: { method: string; url: string }[] = [];
    const res = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    const fetch: CfFetch = async (url, init) => {
        const method = init?.method ?? "GET";
        calls.push({ method, url });
        if (url.includes("/zones?name=")) return res({ success: true, result: [{ id: "zone1" }] });
        if (url.includes("/dns_records?type=TXT")) return res({ success: true, result: [] });
        if (url.endsWith("/dns_records") && method === "POST") return res({ success: true, result: { id: "txt1" } });
        if (url.includes("/dns_records/txt1") && method === "DELETE") return res({ success: true, result: {} });
        return res({ success: true, result: [] });
    };
    return { fetch, calls };
}

test("CloudflareDns01 creates and removes the _acme-challenge TXT record", async () => {
    const cf = makeCfFetch();
    const dns = new CloudflareDns01({ token: "cf-token", zone: "example.com", fetch: cf.fetch, logger: silent });
    const id = await dns.setChallenge("gator.example.com", "txtvalue");
    assert.equal(id, "txt1");
    await dns.removeChallenge(id);
    assert.ok(cf.calls.some(c => c.method === "POST" && c.url.endsWith("/dns_records")), "created the record");
    assert.ok(cf.calls.some(c => c.method === "DELETE" && c.url.includes("/dns_records/txt1")), "deleted the record");
});

// ---------- Full AcmeService.issue orchestration ----------

test("AcmeService.issue runs the dns-01 flow and persists cert/key + fires onCert", { skip: hasOpenssl ? false : "openssl not available" }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-acme-"));
    try {
        const { fetch } = makeAcmeFetch();
        const cf = makeCfFetch();
        let reloaded: { key: string; cert: string } | null = null;
        const svc = new AcmeService({
            certsDir: dir,
            cert: new CertificateService(dir, silent),
            logger: silent,
            fetch,
            cfFetch: cf.fetch,
            sleep: noSleep,
            onCert: m => (reloaded = m),
            settings: () => ({
                enabled: true,
                email: "me@example.com",
                domain: "gator.example.com",
                directoryUrl: "https://acme.test/directory",
                cloudflareToken: "cf-token",
                cloudflareZone: "example.com",
                propagationSeconds: 0
            })
        });

        const material = await svc.issue();
        assert.match(material.cert, /BEGIN CERTIFICATE/);
        assert.match(material.key, /PRIVATE KEY/);
        assert.ok(reloaded, "onCert hot-reload hook fired");
        // Persisted to disk (owner-only) for reuse across restarts.
        assert.ok(fs.existsSync(path.join(dir, "le-cert.pem")));
        assert.equal(fs.statSync(path.join(dir, "le-key.pem")).mode & 0o777, 0o600);
        assert.ok(fs.existsSync(path.join(dir, "acme-account.pem")), "account key persisted");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("AcmeService.issue surfaces a clear error when Cloudflare creds are missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-acme2-"));
    try {
        const svc = new AcmeService({
            certsDir: dir,
            cert: new CertificateService(dir, silent),
            logger: silent,
            settings: () => ({
                enabled: true,
                email: "me@example.com",
                domain: "gator.example.com",
                directoryUrl: "https://acme.test/directory",
                cloudflareToken: "",
                cloudflareZone: ""
            })
        });
        await assert.rejects(() => svc.issue(), /Cloudflare API token and zone/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
