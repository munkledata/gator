import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison.
 *
 * The legacy server compares the password with a plain `===`, which leaks length
 * and prefix via timing. This compares in time independent of where the mismatch
 * is (and handles unequal lengths without an early-out).
 */
export function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) {
        // Keep the work roughly constant and still return false.
        timingSafeEqual(ab, ab);
        return false;
    }
    return timingSafeEqual(ab, bb);
}

/**
 * Whether a request is the trusted local admin UI.
 *
 * The local Electron window is granted password-free access — but **never** by
 * source IP. A same-host TLS-terminating reverse proxy makes every remote client
 * appear to come from 127.0.0.1, so an IP check would hand the full admin surface to
 * the internet (audit S1). Instead the shell mints a per-boot secret, injects it into
 * the daemon (env) and into its own renderer (preload), and the renderer presents it
 * on every call. A remote browser loading the same bundle has no way to learn the
 * token (it is never served over HTTP), so it falls back to the password.
 */
export function isTrustedLocal(presented: string | undefined, localToken: string | undefined): boolean {
    if (!localToken || !presented) return false;
    return safeEqual(presented, localToken);
}

interface FailureEntry {
    count: number;
    lockedUntil: number;
}

/**
 * Failure-count lockout limiter, keyed by an identifier (e.g. client IP). The
 * legacy auth path has no brute-force protection at all.
 */
export class RateLimiter {
    readonly #entries = new Map<string, FailureEntry>();
    readonly #maxFailures: number;
    readonly #lockoutMs: number;
    readonly #now: () => number;

    constructor(maxFailures = 10, lockoutMs = 60_000, now: () => number = () => Date.now()) {
        this.#maxFailures = maxFailures;
        this.#lockoutMs = lockoutMs;
        this.#now = now;
    }

    isLocked(key: string): boolean {
        const entry = this.#entries.get(key);
        if (!entry) return false;
        if (this.#now() >= entry.lockedUntil) {
            // Lockout window elapsed — forgive and forget.
            if (entry.count >= this.#maxFailures) this.#entries.delete(key);
            return false;
        }
        return entry.count >= this.#maxFailures;
    }

    recordFailure(key: string): void {
        const entry = this.#entries.get(key) ?? { count: 0, lockedUntil: 0 };
        entry.count += 1;
        if (entry.count >= this.#maxFailures) {
            entry.lockedUntil = this.#now() + this.#lockoutMs;
        }
        this.#entries.set(key, entry);
    }

    reset(key: string): void {
        this.#entries.delete(key);
    }
}
