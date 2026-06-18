/**
 * A tiny, explicit dependency-injection container.
 *
 * This is the structural replacement for the legacy global `Server()` singleton
 * — a ~1700-line god-object referenced by 74 files with ~25 nullable mutable
 * fields. Here, each component is registered as a lazily-constructed singleton
 * keyed by a typed {@link Token}; nothing reaches into a global. That makes
 * components isolatable and unit-testable (a test wires up only the tokens it
 * needs), and it makes the dependency graph explicit rather than ambient.
 *
 * Deliberately hand-rolled: no InversifyJS/tsyringe, no decorators, no
 * reflect-metadata. ~50 lines is enough and keeps the graph readable.
 */

export interface Token<T> {
    readonly id: symbol;
    readonly description: string;
    /** Phantom field so two tokens of different T aren't assignable. */
    readonly __type?: T;
}

export function token<T>(description: string): Token<T> {
    return { id: Symbol(description), description };
}

type Factory<T> = (container: Container) => T;

export class Container {
    readonly #factories = new Map<symbol, Factory<unknown>>();
    readonly #singletons = new Map<symbol, unknown>();
    readonly #resolving = new Set<symbol>();

    /** Register a lazily-constructed singleton. The factory runs at most once. */
    register<T>(token: Token<T>, factory: Factory<T>): this {
        this.#factories.set(token.id, factory as Factory<unknown>);
        return this;
    }

    /** Register an already-constructed value. */
    registerValue<T>(token: Token<T>, value: T): this {
        this.#singletons.set(token.id, value);
        return this;
    }

    /** Resolve a token, constructing (and memoizing) it on first use. */
    resolve<T>(token: Token<T>): T {
        if (this.#singletons.has(token.id)) {
            return this.#singletons.get(token.id) as T;
        }

        const factory = this.#factories.get(token.id);
        if (!factory) {
            throw new Error(`Container: nothing registered for token "${token.description}"`);
        }

        if (this.#resolving.has(token.id)) {
            throw new Error(`Container: circular dependency while resolving "${token.description}"`);
        }

        this.#resolving.add(token.id);
        try {
            const value = factory(this) as T;
            this.#singletons.set(token.id, value);
            return value;
        } finally {
            this.#resolving.delete(token.id);
        }
    }

    has<T>(token: Token<T>): boolean {
        return this.#singletons.has(token.id) || this.#factories.has(token.id);
    }
}
