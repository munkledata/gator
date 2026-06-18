import { type Config, DEFAULT_CONFIG, parseConfig } from "../../config/configSchema";
import type { Device } from "../../notifications/types";

/**
 * Persistence boundary for the writable config DB. Implementations: the production
 * {@link DrizzleConfigStore} (better-sqlite3) and {@link InMemoryConfigStore}
 * (tests / headless). Callers depend on this interface, never on Drizzle directly.
 */
export interface ConfigStore {
    /** The current, fully-parsed config (all defaults applied). */
    getConfig(): Config;
    /** Shallow-merge a patch over the top-level config, re-validate, persist, return it. */
    setConfig(patch: Partial<Config>): Promise<Config>;
    listDevices(): Promise<Device[]>;
    upsertDevice(device: Device): Promise<void>;
    removeDevice(id: string): Promise<void>;
}

/** In-memory store for tests and headless/no-DB contexts. */
export class InMemoryConfigStore implements ConfigStore {
    #config: Config;
    readonly #devices = new Map<string, Device>();

    constructor(initial?: unknown) {
        this.#config = initial === undefined ? DEFAULT_CONFIG : parseConfig(initial);
    }

    getConfig(): Config {
        return this.#config;
    }

    async setConfig(patch: Partial<Config>): Promise<Config> {
        this.#config = parseConfig({ ...this.#config, ...patch });
        return this.#config;
    }

    async listDevices(): Promise<Device[]> {
        return [...this.#devices.values()];
    }

    async upsertDevice(device: Device): Promise<void> {
        this.#devices.set(device.id, device);
    }

    async removeDevice(id: string): Promise<void> {
        this.#devices.delete(id);
    }
}
