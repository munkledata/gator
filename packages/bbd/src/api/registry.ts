import type { Operation } from "./Operation";

/** A collection of operations, keyed by name. Adapters iterate it to mount routes. */
export class OperationRegistry {
    readonly #operations = new Map<string, Operation>();

    register<I, O>(op: Operation<I, O>): this {
        if (this.#operations.has(op.name)) {
            throw new Error(`duplicate operation: "${op.name}"`);
        }
        this.#operations.set(op.name, op as Operation);
        return this;
    }

    registerAll(ops: readonly Operation[]): this {
        for (const op of ops) this.register(op);
        return this;
    }

    all(): Operation[] {
        return [...this.#operations.values()];
    }

    get(name: string): Operation | undefined {
        return this.#operations.get(name);
    }
}
