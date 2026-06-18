import type { Config } from "./configSchema";
import type { ConfigStore } from "../data/config-db/ConfigStore";
import type { EventBus } from "../core/bus";
import type { Logger } from "../core/logger";

export interface ConfigChange {
    key: string;
    previous: unknown;
    next: unknown;
}

/** The bus channel ConfigService publishes on. */
export interface ConfigEvents {
    "config-changed": ConfigChange[];
}

/**
 * The reconcile loop.
 *
 * Applies a config patch through the store, diffs old vs new, and broadcasts the
 * changed keys on the event bus. Subscribers (the tunnel, the notification registry,
 * the private-api toggle, …) react only to the keys they care about — replacing the
 * legacy monolithic `handleConfigUpdate` chain that knew about every consumer.
 */
export class ConfigService {
    readonly #store: ConfigStore;
    readonly #bus: EventBus<ConfigEvents>;
    readonly #logger: Logger;

    constructor(store: ConfigStore, bus: EventBus<ConfigEvents>, logger: Logger) {
        this.#store = store;
        this.#bus = bus;
        this.#logger = logger.child({ component: "ConfigService" });
    }

    get(): Config {
        return this.#store.getConfig();
    }

    async update(patch: Partial<Config>): Promise<Config> {
        const before = this.#store.getConfig();
        const after = await this.#store.setConfig(patch);
        const changes = diffConfig(before, after);
        if (changes.length > 0) {
            this.#logger.info(`config changed: ${changes.map(c => c.key).join(", ")}`);
            this.#bus.emit("config-changed", changes);
        }
        return after;
    }
}

function diffConfig(before: Config, after: Config): ConfigChange[] {
    const keys = new Set<keyof Config>([
        ...(Object.keys(before) as (keyof Config)[]),
        ...(Object.keys(after) as (keyof Config)[])
    ]);
    const changes: ConfigChange[] = [];
    for (const key of keys) {
        const previous = before[key];
        const next = after[key];
        if (JSON.stringify(previous) !== JSON.stringify(next)) {
            changes.push({ key: String(key), previous, next });
        }
    }
    return changes;
}
