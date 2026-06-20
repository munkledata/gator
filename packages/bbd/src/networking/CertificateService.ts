import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Logger } from "../core/logger";

const execFileAsync = promisify(execFile);

export interface TlsMaterial {
    key: string;
    cert: string;
}

/**
 * Provides the TLS key/cert pair the HTTPS listener needs.
 *
 * Restores the self-signed-certificate capability upstream had (its `certificateService`
 * used node-forge/@peculiar/x509) without pulling a crypto dependency: we shell out to
 * the system `openssl` (macOS ships LibreSSL) via execFile — no shell, fixed argv, so no
 * injection surface, matching the OsascriptRunner pattern. A user-supplied cert/key path
 * takes precedence; otherwise a self-signed pair is generated once and reused.
 */
export class CertificateService {
    readonly #dir: string;
    readonly #logger: Logger;

    constructor(certsDir: string, logger: Logger) {
        this.#dir = certsDir;
        this.#logger = logger.child({ component: "CertificateService" });
    }

    /** Load a user-provided cert/key pair from disk. Throws if either is missing. */
    loadFrom(certPath: string, keyPath: string): TlsMaterial {
        return { cert: fs.readFileSync(certPath, "utf8"), key: fs.readFileSync(keyPath, "utf8") };
    }

    /**
     * Generate a fresh RSA-2048 key + PKCS#10 CSR for the given domain(s), via openssl.
     * Returns the private-key PEM and the CSR in base64url DER, which is the exact shape
     * ACME's finalize step wants. RSA (not EC) for the widest BlueBubbles-client TLS compat.
     */
    async generateKeyAndCsr(domain: string, sans: string[] = []): Promise<{ keyPem: string; csrDerB64Url: string }> {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gator-csr-"));
        const keyPath = path.join(dir, "key.pem");
        const csrPath = path.join(dir, "csr.der");
        try {
            await execFileAsync("openssl", ["genrsa", "-out", keyPath, "2048"]);
            const names = [domain, ...sans.filter(Boolean)].filter((d, i, a) => a.indexOf(d) === i);
            const sanArg = `subjectAltName=${names.map(d => `DNS:${d}`).join(",")}`;
            const base = ["req", "-new", "-key", keyPath, "-subj", `/CN=${domain}`, "-outform", "DER", "-out", csrPath];
            try {
                await execFileAsync("openssl", [...base, "-addext", sanArg]);
            } catch (e) {
                this.#logger.warn(`openssl -addext failed for CSR (${(e as Error)?.message ?? e}); CSR will be CN-only`);
                await execFileAsync("openssl", base);
            }
            return { keyPem: fs.readFileSync(keyPath, "utf8"), csrDerB64Url: fs.readFileSync(csrPath).toString("base64url") };
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    /**
     * Return the self-signed pair, generating it on first use. `sans` are extra
     * subjectAltName entries (e.g. the configured public hostname) so clients that check
     * SAN accept it; loopback names are always included.
     */
    async ensureSelfSigned(commonName = "Gator", sans: string[] = []): Promise<TlsMaterial> {
        const keyPath = path.join(this.#dir, "key.pem");
        const certPath = path.join(this.#dir, "cert.pem");
        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            return { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certPath, "utf8") };
        }
        fs.mkdirSync(this.#dir, { recursive: true });

        const sanList = ["DNS:localhost", "IP:127.0.0.1", ...sans.filter(Boolean).map(toSanEntry)].join(",");
        const base = [
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            keyPath,
            "-out",
            certPath,
            "-days",
            "825",
            "-subj",
            `/CN=${commonName}`
        ];
        try {
            await execFileAsync("openssl", [...base, "-addext", `subjectAltName=${sanList}`]);
        } catch (e) {
            // Older LibreSSL builds lack -addext; fall back to a CN-only cert (still usable
            // for clients that accept self-signed without SAN validation).
            this.#logger.warn(`openssl -addext failed (${(e as Error)?.message ?? e}); generating a CN-only self-signed cert`);
            await execFileAsync("openssl", base);
        }
        try {
            fs.chmodSync(keyPath, 0o600);
        } catch {
            /* best effort */
        }
        this.#logger.info(`generated self-signed certificate at ${certPath}`);
        return { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certPath, "utf8") };
    }
}

/** Turn a bare host into the right SAN entry (IP:… for literals, DNS:… for names). */
function toSanEntry(host: string): string {
    const h = host.trim().replace(/^\[|\]$/g, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return `IP:${h}`;
    return `DNS:${h}`;
}

/** Extract a bare hostname from a possibly-URL config value, for the cert SAN. */
export function hostFromServerAddress(value: unknown): string | undefined {
    if (typeof value !== "string" || !value) return undefined;
    try {
        return new URL(value).hostname.replace(/^\[|\]$/g, "") || undefined;
    } catch {
        return undefined;
    }
}
