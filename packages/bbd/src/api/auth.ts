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
    /** Last time this key saw a failure — drives forgiveness/pruning of sub-threshold entries. */
    seenAt: number;
}

/**
 * Failure-count lockout limiter, keyed by an identifier (e.g. client IP). The
 * legacy auth path has no brute-force protection at all.
 *
 * Memory safety (audit F27): a naive map grows unboundedly because sub-threshold
 * entries (a single bad attempt that never reaches the lockout count) are never
 * removed — a stream of unique IPs would leak. We forgive a key once `lockoutMs`
 * has elapsed since its last failure (whether or not it ever locked), prune such
 * stale entries lazily on each `isLocked`/`recordFailure`, and cap the map size with
 * an opportunistic sweep so the worst case is bounded. The lockout behavior for an
 * actively-attacking key is unchanged.
 */
export class RateLimiter {
    readonly #entries = new Map<string, FailureEntry>();
    readonly #maxFailures: number;
    readonly #lockoutMs: number;
    readonly #now: () => number;
    readonly #maxEntries: number;

    constructor(maxFailures = 10, lockoutMs = 60_000, now: () => number = () => Date.now(), maxEntries = 10_000) {
        this.#maxFailures = maxFailures;
        this.#lockoutMs = lockoutMs;
        this.#now = now;
        this.#maxEntries = maxEntries;
    }

    /** Whether this entry has been idle long enough to forgive (and drop). */
    #expired(entry: FailureEntry, now: number): boolean {
        // A locked key stays until its lockout ends; an unlocked key is forgiven once
        // `lockoutMs` passes with no further failures. `seenAt + lockoutMs` covers both.
        return now >= entry.lockedUntil && now >= entry.seenAt + this.#lockoutMs;
    }

    isLocked(key: string): boolean {
        const now = this.#now();
        const entry = this.#entries.get(key);
        if (!entry) return false;
        if (this.#expired(entry, now)) {
            // Lockout/forgiveness window elapsed — forget the key entirely (prevents the
            // map from accumulating stale sub-threshold entries forever).
            this.#entries.delete(key);
            return false;
        }
        return entry.count >= this.#maxFailures;
    }

    recordFailure(key: string): void {
        const now = this.#now();
        const existing = this.#entries.get(key);
        // A stale entry (window elapsed) starts fresh rather than accumulating forever.
        const entry =
            existing && !this.#expired(existing, now) ? existing : { count: 0, lockedUntil: 0, seenAt: now };
        entry.count += 1;
        entry.seenAt = now;
        if (entry.count >= this.#maxFailures) {
            entry.lockedUntil = now + this.#lockoutMs;
        }
        this.#entries.set(key, entry);
        if (this.#entries.size > this.#maxEntries) this.#sweep(now);
    }

    reset(key: string): void {
        this.#entries.delete(key);
    }

    /**
     * Drop every forgiven (expired) entry. Runs only when the map exceeds its cap; if it's
     * still over after pruning (a real flood of distinct, actively-failing keys), evict the
     * oldest-seen entries down to the cap so memory stays bounded under adversarial load.
     */
    #sweep(now: number): void {
        for (const [key, entry] of this.#entries) {
            if (this.#expired(entry, now)) this.#entries.delete(key);
        }
        if (this.#entries.size <= this.#maxEntries) return;
        const byAge = [...this.#entries.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt);
        for (const [key] of byAge) {
            if (this.#entries.size <= this.#maxEntries) break;
            this.#entries.delete(key);
        }
    }
}

/** The outcome of a rate-limited password check. */
export type PasswordAuthResult = "ok" | "unauthorized" | "locked";

/**
 * The single shared password-auth + lockout decision, so EVERY password surface enforces the
 * same brute-force protection (audit F8) — previously only {@link executeOperation} consulted
 * the limiter, leaving the attachment-download route and the Socket.IO handshake as
 * unthrottled password oracles. Mirrors executeOperation's order exactly:
 *   1. `locked` (limiter says too many recent failures for this key) — caller returns 403 /
 *      rejects the connection;
 *   2. verify the password constant-time; on mismatch `recordFailure(key)` → `unauthorized`;
 *   3. on success `reset(key)` → `ok`.
 * An empty configured password never authenticates (matches executeOperation).
 */
export function checkPasswordAuth(
    presented: string | undefined,
    password: string,
    key: string,
    rateLimiter?: RateLimiter
): PasswordAuthResult {
    if (rateLimiter?.isLocked(key)) return "locked";
    const authed = presented != null && password.length > 0 && safeEqual(presented, password);
    if (!authed) {
        rateLimiter?.recordFailure(key);
        return "unauthorized";
    }
    rateLimiter?.reset(key);
    return "ok";
}
