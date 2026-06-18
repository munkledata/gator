/**
 * A small, strongly-typed event bus.
 *
 * Replaces the legacy `Server().emitMessage(type, data, priority)` multiplexer
 * and the ~8 near-identical `startChatListeners` fan-out handlers. Producers
 * (the DB/detection layer) emit one normalized domain event; sinks (Socket.IO,
 * FCM, webhooks) subscribe. The event-name → payload mapping is a compile-time
 * type, so a typo or a wrong payload shape is a build error, not a runtime one.
 *
 * A misbehaving listener is isolated: it cannot break the fan-out to the other
 * sinks (the legacy code had no such guarantee). Listener errors are routed to an
 * optional `onError` hook instead of propagating.
 */

export type EventMap = Record<string, unknown>;
export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

// Constraint is `object` (not `EventMap`) so an `interface DomainEvents { … }`
// works as the event map — interfaces are not assignable to `Record<string,
// unknown>` in TypeScript, but they are objects.
export class EventBus<M extends object = EventMap> {
    readonly #listeners = new Map<keyof M, Set<Listener<never>>>();
    readonly #onError: (event: keyof M, error: unknown) => void;

    constructor(onError?: (event: keyof M, error: unknown) => void) {
        this.#onError =
            onError ??
            ((event, error) => {
                // Default: don't let a listener failure escape the bus.
                console.error(`[EventBus] listener for "${String(event)}" threw:`, error);
            });
    }

    /** Subscribe to an event. Returns an unsubscribe function. */
    on<K extends keyof M>(event: K, listener: Listener<M[K]>): Unsubscribe {
        let set = this.#listeners.get(event);
        if (!set) {
            set = new Set();
            this.#listeners.set(event, set);
        }
        set.add(listener as Listener<never>);
        return () => this.off(event, listener);
    }

    /** Subscribe to the next occurrence only. */
    once<K extends keyof M>(event: K, listener: Listener<M[K]>): Unsubscribe {
        const wrapped: Listener<M[K]> = payload => {
            this.off(event, wrapped);
            listener(payload);
        };
        return this.on(event, wrapped);
    }

    off<K extends keyof M>(event: K, listener: Listener<M[K]>): void {
        const set = this.#listeners.get(event);
        if (!set) return;
        set.delete(listener as Listener<never>);
        if (set.size === 0) this.#listeners.delete(event);
    }

    /** Emit an event to all current listeners, isolating per-listener failures. */
    emit<K extends keyof M>(event: K, payload: M[K]): void {
        const set = this.#listeners.get(event);
        if (!set || set.size === 0) return;
        // Snapshot so a listener that (un)subscribes during dispatch is safe.
        for (const listener of [...set]) {
            try {
                (listener as Listener<M[K]>)(payload);
            } catch (e) {
                this.#onError(event, e);
            }
        }
    }

    listenerCount<K extends keyof M>(event: K): number {
        return this.#listeners.get(event)?.size ?? 0;
    }

    clear(): void {
        this.#listeners.clear();
    }
}
