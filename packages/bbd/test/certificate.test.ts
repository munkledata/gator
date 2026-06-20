import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CertificateService, hostFromServerAddress } from "../src/networking/CertificateService";
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

test("ensureSelfSigned generates a reusable, owner-only PEM cert/key pair", { skip: hasOpenssl ? false : "openssl not available" }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-cert-"));
    try {
        const svc = new CertificateService(dir, silent);
        const m = await svc.ensureSelfSigned("Gator", ["example.com"]);
        assert.match(m.cert, /BEGIN CERTIFICATE/);
        assert.match(m.key, /PRIVATE KEY/);
        // Reused on subsequent calls (not regenerated).
        const m2 = await svc.ensureSelfSigned("Gator");
        assert.equal(m2.cert, m.cert);
        // The private key is owner-only.
        assert.equal(fs.statSync(path.join(dir, "key.pem")).mode & 0o777, 0o600);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("loadFrom reads a user-supplied cert/key pair", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-cert2-"));
    try {
        fs.writeFileSync(path.join(dir, "c.pem"), "CERTDATA");
        fs.writeFileSync(path.join(dir, "k.pem"), "KEYDATA");
        const svc = new CertificateService(dir, silent);
        const m = svc.loadFrom(path.join(dir, "c.pem"), path.join(dir, "k.pem"));
        assert.equal(m.cert, "CERTDATA");
        assert.equal(m.key, "KEYDATA");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("hostFromServerAddress extracts the bare hostname", () => {
    assert.equal(hostFromServerAddress("https://gator.example.com:1235"), "gator.example.com");
    assert.equal(hostFromServerAddress("https://[::1]:1235"), "::1");
    assert.equal(hostFromServerAddress("not a url"), undefined);
    assert.equal(hostFromServerAddress(""), undefined);
});
