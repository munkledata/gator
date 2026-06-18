/**
 * Correlates request transaction ids with their responses.
 *
 * The legacy server keeps an unbounded, never-pruned `promises` array scanned
 * O(n) per response — a memory leak and a slowdown. This is a `Map` with eviction
 * on resolve/reject/timeout, and a hard per-transaction timeout (the legacy used a
 * single hardcoded 2-minute window).
 */
export class TransactionManager<T = unknown> {
    readonly #pending = new Map<string, { resolve: (v: T) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
    readonly #defaultTimeoutMs: number;

    constructor(defaultTimeoutMs = 30_000) {
        this.#defaultTimeoutMs = defaultTimeoutMs;
    }

    /** Register a transaction and return a promise that settles on resolve/reject/timeout. */
    create(id: string, timeoutMs = this.#defaultTimeoutMs): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(id);
                reject(new Error(`transaction "${id}" timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            timer.unref?.();
            this.#pending.set(id, { resolve, reject, timer });
        });
    }

    resolve(id: string, value: T): boolean {
        const entry = this.#pending.get(id);
        if (!entry) return false;
        clearTimeout(entry.timer);
        this.#pending.delete(id);
        entry.resolve(value);
        return true;
    }

    reject(id: string, error: Error): boolean {
        const entry = this.#pending.get(id);
        if (!entry) return false;
        clearTimeout(entry.timer);
        this.#pending.delete(id);
        entry.reject(error);
        return true;
    }

    /** Fail every pending transaction (e.g. on disconnect). */
    rejectAll(error: Error): void {
        for (const entry of this.#pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(error);
        }
        this.#pending.clear();
    }

    get size(): number {
        return this.#pending.size;
    }
}
