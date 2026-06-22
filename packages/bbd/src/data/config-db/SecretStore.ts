import { spawn } from "node:child_process";

/**
 * A place to keep long-lived secrets encrypted at rest, OUT of the plaintext config DB
 * (audit F18). The production implementation is {@link MacKeychainSecretStore} (the macOS
 * login Keychain); {@link InMemorySecretStore} backs the unit tests and any non-macOS host.
 *
 * Values are opaque strings. Callers that hold non-string secrets (e.g. the FCM
 * service-account object) serialize to a string before `set` and parse after `get`.
 */
export interface SecretStore {
    /** The stored secret for `account`, or null if absent. */
    get(account: string): Promise<string | null>;
    /** Store (or replace) the secret for `account`. */
    set(account: string, secret: string): Promise<void>;
    /** Remove the secret for `account` (no-op if absent). */
    delete(account: string): Promise<void>;
    /** Whether this store is usable on this host right now (platform + reachable backend). */
    available(): Promise<boolean>;
}

/** Hard cap on any `security` call. A locked keychain or first-access ACL dialog can make the
 *  CLI block indefinitely; since the store is built on the awaited boot path, we must never hang. */
const SECURITY_TIMEOUT_MS = 5000;

/** Spawn `/usr/bin/security` with no shell; optionally feed `stdin`. Never throws, never hangs. */
function runSecurity(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise(resolve => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        const done = (r: { code: number; stdout: string; stderr: string }): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(r);
        };
        let child;
        try {
            child = spawn("security", args, { stdio: ["pipe", "pipe", "pipe"] });
        } catch (e) {
            resolve({ code: -1, stdout: "", stderr: String(e) });
            return;
        }
        // If `security` blocks (locked keychain / interactive ACL prompt), kill it so the store
        // degrades to plaintext (available()→false) instead of hanging startBbdBackend forever.
        timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch {
                /* already exited */
            }
            done({ code: -1, stdout, stderr: stderr || "security: timed out" });
        }, SECURITY_TIMEOUT_MS);
        child.stdout.on("data", d => (stdout += d.toString()));
        child.stderr.on("data", d => (stderr += d.toString()));
        child.on("error", e => done({ code: -1, stdout, stderr: stderr || String(e) }));
        child.on("close", code => done({ code: code ?? -1, stdout, stderr }));
        // The secret (when present) travels on STDIN, never argv — so it is not visible in
        // `ps`/the process table. `add-generic-password -w` (no value) prompts twice
        // ("enter" + "retype"), so the value is written twice.
        if (stdin !== undefined) child.stdin.write(stdin);
        child.stdin.end();
    });
}

/**
 * macOS login-Keychain secret store, driven by the `security(1)` CLI.
 *
 * Why the CLI and not a native binding: every access (read and write) goes through the
 * SAME `/usr/bin/security` binary, so the per-application keychain ACL stays consistent and
 * reads are non-interactive while the login keychain is unlocked — whereas a native binding
 * would make the *accessing app* the daemon binary, which re-signing/updating could turn into
 * an auth prompt. It also needs no native module to build/rebuild for Electron, and it works
 * from the headless `bbd` daemon process (which has no Electron `safeStorage`).
 *
 * Secrets are base64-encoded before storage so arbitrary bytes (PEM newlines, JSON) round-trip
 * cleanly through the CLI's newline-delimited `-w` output.
 */
export class MacKeychainSecretStore implements SecretStore {
    readonly #service: string;

    constructor(service = "bluebubbles-server") {
        this.#service = service;
    }

    async available(): Promise<boolean> {
        if (process.platform !== "darwin") return false;
        // Prove the keychain is actually USABLE (unlocked + readable), not merely present:
        // `list-keychains` exits 0 even on a LOCKED or pre-login login keychain, which would then
        // fail every real get() and silently drop credentials. Round-trip a sentinel instead; the
        // 5s spawn timeout means a locked keychain returns false rather than hanging boot.
        const probe = "__bbd_probe__";
        try {
            await this.set(probe, "ok");
            const v = await this.get(probe);
            await this.delete(probe);
            return v === "ok";
        } catch {
            return false;
        }
    }

    async get(account: string): Promise<string | null> {
        const r = await runSecurity(["find-generic-password", "-w", "-s", this.#service, "-a", account]);
        if (r.code === 44) return null; // errSecItemNotFound
        if (r.code !== 0) throw new Error(`keychain get failed (${r.code}): ${r.stderr.trim()}`);
        // `-w` prints the stored value followed by exactly one trailing newline.
        const b64 = r.stdout.replace(/\n$/, "");
        try {
            return Buffer.from(b64, "base64").toString("utf8");
        } catch {
            return b64; // not base64 (shouldn't happen for values we wrote) — return raw
        }
    }

    async set(account: string, secret: string): Promise<void> {
        const b64 = Buffer.from(secret, "utf8").toString("base64");
        // `-U` updates in place if the item already exists. Value fed twice via stdin
        // (enter + retype), so it never appears in argv/`ps`.
        const r = await runSecurity(
            ["add-generic-password", "-U", "-s", this.#service, "-a", account, "-w"],
            `${b64}\n${b64}\n`
        );
        if (r.code !== 0) throw new Error(`keychain set failed (${r.code}): ${r.stderr.trim()}`);
    }

    async delete(account: string): Promise<void> {
        const r = await runSecurity(["delete-generic-password", "-s", this.#service, "-a", account]);
        if (r.code !== 0 && r.code !== 44) throw new Error(`keychain delete failed (${r.code}): ${r.stderr.trim()}`);
    }
}

/** In-memory secret store for tests and non-macOS/headless hosts. */
export class InMemorySecretStore implements SecretStore {
    readonly #map = new Map<string, string>();
    #available: boolean;

    constructor(available = true) {
        this.#available = available;
    }

    setAvailable(v: boolean): void {
        this.#available = v;
    }

    async available(): Promise<boolean> {
        return this.#available;
    }

    async get(account: string): Promise<string | null> {
        return this.#map.has(account) ? (this.#map.get(account) as string) : null;
    }

    async set(account: string, secret: string): Promise<void> {
        this.#map.set(account, secret);
    }

    async delete(account: string): Promise<void> {
        this.#map.delete(account);
    }
}
