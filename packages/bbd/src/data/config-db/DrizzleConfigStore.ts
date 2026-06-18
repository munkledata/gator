import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { configTable, devicesTable } from "./tables";
import { type Config, DEFAULT_CONFIG, parseConfig } from "../../config/configSchema";
import type { ConfigStore } from "./ConfigStore";
import type { Device } from "../../notifications/types";

const CONFIG_KEY = "config";

/**
 * The production config store, backed by better-sqlite3 via Drizzle.
 *
 * Typecheck-verified here; running it needs the native better-sqlite3 addon (the
 * unit tests use {@link InMemoryConfigStore} instead). The whole config blob lives
 * in one row; devices are individual rows with a provider discriminator.
 */
export class DrizzleConfigStore implements ConfigStore {
    readonly #db: BetterSQLite3Database;
    #config: Config;

    constructor(dbPath: string) {
        const sqlite = new Database(dbPath);
        sqlite.pragma("journal_mode = WAL");
        sqlite.exec(
            `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS devices (
                 id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
                 registration TEXT NOT NULL, created_at INTEGER NOT NULL, last_active_at INTEGER
             );`
        );
        this.#db = drizzle(sqlite);
        this.#config = this.#load();
    }

    #load(): Config {
        const row = this.#db.select().from(configTable).where(eq(configTable.key, CONFIG_KEY)).get();
        if (!row) return DEFAULT_CONFIG;
        return parseConfig(JSON.parse(row.value));
    }

    getConfig(): Config {
        return this.#config;
    }

    async setConfig(patch: Partial<Config>): Promise<Config> {
        const merged = parseConfig({ ...this.#config, ...patch });
        const value = JSON.stringify(merged);
        this.#db
            .insert(configTable)
            .values({ key: CONFIG_KEY, value })
            .onConflictDoUpdate({ target: configTable.key, set: { value } })
            .run();
        this.#config = merged;
        return merged;
    }

    async listDevices(): Promise<Device[]> {
        return this.#db.select().from(devicesTable).all().map(rowToDevice);
    }

    async upsertDevice(device: Device): Promise<void> {
        const row = {
            id: device.id,
            name: device.name,
            provider: device.provider,
            registration: registrationJson(device),
            createdAt: device.createdAt,
            lastActiveAt: device.lastActiveAt ?? null
        };
        this.#db
            .insert(devicesTable)
            .values(row)
            .onConflictDoUpdate({ target: devicesTable.id, set: row })
            .run();
    }

    async removeDevice(id: string): Promise<void> {
        this.#db.delete(devicesTable).where(eq(devicesTable.id, id)).run();
    }
}

function registrationJson(device: Device): string {
    switch (device.provider) {
        case "unifiedpush":
            return JSON.stringify({ endpoint: device.endpoint });
        case "fcm":
            return JSON.stringify({ token: device.token });
        case "webpush":
            return JSON.stringify({ subscription: device.subscription });
    }
}

function rowToDevice(row: typeof devicesTable.$inferSelect): Device {
    const reg = JSON.parse(row.registration);
    const base = { id: row.id, name: row.name, createdAt: row.createdAt, lastActiveAt: row.lastActiveAt ?? undefined };
    switch (row.provider) {
        case "unifiedpush":
            return { ...base, provider: "unifiedpush", endpoint: reg.endpoint };
        case "fcm":
            return { ...base, provider: "fcm", token: reg.token };
        case "webpush":
            return { ...base, provider: "webpush", subscription: reg.subscription };
        default:
            throw new Error(`unknown provider "${row.provider}" for device ${row.id}`);
    }
}
