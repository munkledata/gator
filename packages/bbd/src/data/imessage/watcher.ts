import { watch, type FSWatcher } from "node:fs";

/**
 * Coalesces a burst of triggers into one trailing call. Extracted so the debounce
 * behavior is unit-testable without real filesystem events.
 */
export class Debouncer {
    #timer: NodeJS.Timeout | undefined;
    readonly #fn: () => void;
    readonly #ms: number;

    constructor(fn: () => void, ms: number) {
        this.#fn = fn;
        this.#ms = ms;
    }

    trigger(): void {
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            this.#fn();
        }, this.#ms);
    }

    cancel(): void {
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = undefined;
    }

    get pending(): boolean {
        return this.#timer !== undefined;
    }
}

export interface WatcherOptions {
    /** Coalesce window for WAL-commit bursts. */
    debounceMs?: number;
    /** Low-frequency full reconcile, the backstop for FSEvents drops. */
    reconcileMs?: number;
}

/**
 * Watches `~/Library/Messages` for chat.db / chat.db-wal commits and fires
 * `onChange` (debounced). `node:fs.watch` is FSEvents-backed on macOS — event-driven
 * detection, no polling. FSEvents can coalesce or drop under load and on atomic file
 * replacement, so a low-frequency reconcile timer always runs as the correctness
 * backstop.
 */
export class ChatDbWatcher {
    readonly #dir: string;
    readonly #onChange: () => void;
    readonly #debouncer: Debouncer;
    readonly #reconcileMs: number;
    #watcher: FSWatcher | undefined;
    #reconcile: NodeJS.Timeout | undefined;

    constructor(dir: string, onChange: () => void, opts: WatcherOptions = {}) {
        this.#dir = dir;
        this.#onChange = onChange;
        this.#debouncer = new Debouncer(onChange, opts.debounceMs ?? 250);
        this.#reconcileMs = opts.reconcileMs ?? 60_000;
    }

    start(): void {
        this.#watcher = watch(this.#dir, (_event, filename) => {
            // Only react to the chat.db family (chat.db, -wal, -shm).
            if (filename && !filename.toString().startsWith("chat.db")) return;
            this.#debouncer.trigger();
        });
        this.#reconcile = setInterval(this.#onChange, this.#reconcileMs);
    }

    stop(): void {
        this.#watcher?.close();
        this.#watcher = undefined;
        this.#debouncer.cancel();
        if (this.#reconcile) clearInterval(this.#reconcile);
        this.#reconcile = undefined;
    }
}
