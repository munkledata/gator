import fs from "node:fs";
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

        // The config blob holds the server password and every credential in plaintext, so
        // restrict the DB (and its WAL sidecars, created by the pragma above) to the owner
        // — otherwise it lands world/group-readable under the process umask (audit S8).
        //
        // TODO (audit F18 — DEFERRED, out of scope here): file permissions are NOT
        // at-rest encryption. The config row stores long-lived cloud credentials in plaintext
        // (the server password, the FCM service-account private_key, the Cloudflare DDNS API
        // token, the zrok token, the OAuth client secret, and the VAPID private key). These
        // should be moved into the macOS Keychain (Security framework) so they're encrypted at
        // rest and gated by the login keychain, leaving only non-secret config in this DB. That
        // is a sizable native feature and is intentionally NOT attempted here. Until then:
        //   - the 0600 chmod below is the only protection (owner-read only);
        //   - the userData directory containing this DB MUST be excluded from Time Machine and
        //     iCloud/cloud backups (a backup would otherwise carry these plaintext secrets
        //     off-machine) — set the com.apple.metadata:com_apple_backup_excludeItem xattr / use
        //     NSURLIsExcludedFromBackupKey on the directory at the shell level.
        for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
            try {
                fs.chmodSync(f, 0o600);
            } catch {
                /* sidecar may not exist yet on a brand-new DB — recreated owner-only on write */
            }
        }

        // A `config`/`devices` table left over from the legacy server (or an older bbd)
        // can have an incompatible schema — e.g. the legacy `config` table has no `key`
        // column — which makes every query throw ("no such column: key") and crashes the
        // daemon on boot. bbd never wrote to those tables, but rather than DROP them (which
        // silently destroys a user's old data on upgrade), RENAME the incompatible table to
        // a one-time backup so the rows survive for manual recovery; CREATE TABLE IF NOT
        // EXISTS then recreates a clean one. Table/column names here are compile-time
        // literals (never request data), so the interpolation is injection-free.
        const backupIfIncompatible = (table: string, requiredCol: string): void => {
            const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
            if (cols.length === 0 || cols.some(c => c.name === requiredCol)) return; // absent or already compatible
            const backup = `${table}_legacy_backup`;
            const exists = sqlite
                .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
                .get(backup);
            if (exists) {
                // Original legacy data was already preserved on a prior boot; this is a
                // newer incompatible copy we can safely discard without losing the backup.
                sqlite.exec(`DROP TABLE ${table}`);
            } else {
                sqlite.exec(`ALTER TABLE ${table} RENAME TO ${backup}`);
            }
        };
        backupIfIncompatible("config", "key");
        backupIfIncompatible("devices", "provider");

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
        // Skip rows whose provider is no longer supported (e.g. a stale "unifiedpush"
        // row from an earlier build) instead of throwing and breaking the whole list.
        return this.#db
            .select()
            .from(devicesTable)
            .all()
            .map(rowToDevice)
            .filter((d): d is Device => d !== null);
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
        case "fcm":
            return JSON.stringify({ token: device.token });
        case "webpush":
            return JSON.stringify({ subscription: device.subscription });
    }
}

function rowToDevice(row: typeof devicesTable.$inferSelect): Device | null {
    const reg = JSON.parse(row.registration);
    const base = { id: row.id, name: row.name, createdAt: row.createdAt, lastActiveAt: row.lastActiveAt ?? undefined };
    switch (row.provider) {
        case "fcm":
            return { ...base, provider: "fcm", token: reg.token };
        case "webpush":
            return { ...base, provider: "webpush", subscription: reg.subscription };
        default:
            // Unknown/legacy provider (e.g. a stale "unifiedpush" row) — skip it.
            return null;
    }
}
