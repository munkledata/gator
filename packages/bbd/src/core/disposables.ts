/**
 * A registry of things that must be torn down on shutdown.
 *
 * The legacy server leaks resources — most notoriously a 150s `msgCheckInterval`
 * that is created but never stored or cleared, plus assorted watchers and child
 * processes that outlive a restart. Anything with a lifetime (timer, FS watcher,
 * socket, child process) registers here, and `disposeAll()` tears them down in
 * reverse order during a clean stop.
 */

export type Disposable = () => void | Promise<void>;

/** The minimal shape of a stoppable resource we can adopt directly. */
interface Stoppable {
    stop?: () => void | Promise<void>;
    close?: () => void | Promise<void>;
    dispose?: () => void | Promise<void>;
}

export class DisposableRegistry {
    readonly #disposables: Disposable[] = [];
    #disposed = false;

    /** Register an arbitrary teardown callback. */
    add(disposable: Disposable): void {
        if (this.#disposed) {
            // Disposing-after-disposed almost always signals a lifecycle bug.
            throw new Error("DisposableRegistry: cannot add after disposeAll() has run");
        }
        this.#disposables.push(disposable);
    }

    /** `setTimeout` that auto-registers its own cancellation. */
    setTimeout(handler: () => void, ms: number): NodeJS.Timeout {
        const t = setTimeout(handler, ms);
        this.add(() => clearTimeout(t));
        return t;
    }

    /** `setInterval` that auto-registers its own cancellation (fixes the leaked-interval class of bug). */
    setInterval(handler: () => void, ms: number): NodeJS.Timeout {
        const t = setInterval(handler, ms);
        this.add(() => clearInterval(t));
        return t;
    }

    /** Adopt a resource exposing stop()/close()/dispose(); returns it for chaining. */
    track<T extends Stoppable>(resource: T): T {
        // Call exactly ONE teardown method. `??` would chain — a resource exposing both
        // stop() and close() (each returning void) would get both called.
        this.add(() => {
            if (resource.stop) return resource.stop();
            if (resource.close) return resource.close();
            return resource.dispose?.();
        });
        return resource;
    }

    /** Tear everything down in reverse (LIFO) order, isolating per-disposable errors. */
    async disposeAll(): Promise<void> {
        if (this.#disposed) return;
        this.#disposed = true;
        const errors: unknown[] = [];
        while (this.#disposables.length > 0) {
            const disposable = this.#disposables.pop()!;
            try {
                await disposable();
            } catch (e) {
                errors.push(e);
            }
        }
        if (errors.length > 0) {
            throw new AggregateError(errors, `DisposableRegistry: ${errors.length} disposable(s) failed`);
        }
    }

    get size(): number {
        return this.#disposables.length;
    }

    get isDisposed(): boolean {
        return this.#disposed;
    }
}
