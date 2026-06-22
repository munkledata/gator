import { type Config, parseConfig } from "../../config/configSchema";
import type { Logger } from "../../core/logger";
import type { Device } from "../../notifications/types";
import type { ConfigStore } from "./ConfigStore";
import type { SecretStore } from "./SecretStore";

/**
 * A long-lived credential that must NOT sit in the plaintext config DB (audit F18). Each is
 * stored in the {@link SecretStore} (macOS Keychain) under `account`, redacted from the
 * on-disk config blob, and re-hydrated into the in-memory config so every existing consumer
 * (FCM provider, Cloudflare DDNS, zrok tunnel, Web Push) reads it transparently as before.
 */
interface SecretSpec {
    /** Stable id for logs / per-path bookkeeping. */
    key: string;
    /** Keychain account name. */
    account: string;
    /** Dot path into the Config object. */
    path: string[];
    /** Config value -> opaque keychain string. */
    serialize(v: unknown): string;
    /** Keychain string -> config value. */
    deserialize(s: string): unknown;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : String(v));

const SECRET_SPECS: readonly SecretSpec[] = [
    {
        key: "fcm.serviceAccount",
        account: "notifications.fcm.serviceAccount",
        path: ["notifications", "fcm", "serviceAccount"],
        // The service account is usually a parsed object (sometimes a raw JSON string).
        serialize: v => (typeof v === "string" ? v : JSON.stringify(v)),
        deserialize: s => {
            try {
                return JSON.parse(s);
            } catch {
                return s;
            }
        }
    },
    {
        key: "fcm.oauthClientSecret",
        account: "notifications.fcm.oauthClientSecret",
        path: ["notifications", "fcm", "oauthClientSecret"],
        serialize: asString,
        deserialize: s => s
    },
    {
        key: "webpush.vapidPrivateKey",
        account: "notifications.webpush.vapidPrivateKey",
        path: ["notifications", "webpush", "vapidPrivateKey"],
        serialize: asString,
        deserialize: s => s
    },
    {
        key: "cloudflareDdnsApiToken",
        account: "cloudflareDdnsApiToken",
        path: ["cloudflareDdnsApiToken"],
        serialize: asString,
        deserialize: s => s
    },
    {
        // zrok token lives in the .passthrough() surface (not the typed core) — keyed snake_case.
        key: "zrok_token",
        account: "zrok_token",
        path: ["zrok_token"],
        serialize: asString,
        deserialize: s => s
    }
];

function getPath(obj: unknown, path: string[]): unknown {
    let cur: unknown = obj;
    for (const k of path) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
}

/** Set a leaf (creating intermediate objects). `undefined` keeps the key but blanks the value
 *  so JSON.stringify drops it — used to redact a secret from the persisted blob. */
function setPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const k = path[i] as string;
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
        cur = cur[k] as Record<string, unknown>;
    }
    cur[path[path.length - 1] as string] = value;
}

function isNonEmpty(v: unknown): boolean {
    if (v == null) return false;
    if (typeof v === "string") return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
}

function clone<T>(v: T): T {
    return structuredClone(v);
}

/**
 * A {@link ConfigStore} decorator that keeps long-lived credentials in a {@link SecretStore}
 * (the macOS Keychain) instead of the plaintext config DB (audit F18).
 *
 * Invariants:
 *  - `getConfig()` always returns a FULLY-hydrated config (secrets present in memory), so no
 *    consumer changes — only the on-disk representation is redacted.
 *  - A secret is redacted from disk ONLY after it is confirmed stored+readable in the secret
 *    store (verify-before-redact), so a keychain failure can never lose a credential.
 *  - If the secret store is unavailable (non-macOS, locked, error), it degrades to the inner
 *    store's plaintext behavior and logs once — never crashes.
 */
export class VaultedConfigStore implements ConfigStore {
    readonly #inner: ConfigStore;
    readonly #secrets: SecretStore;
    readonly #logger: Logger;
    #config!: Config;
    #vaulting = false;
    // Serializes setConfig so the keychain awaits can't interleave two read-modify-write cycles
    // into a lost update (audit F18 review).
    #writeChain: Promise<unknown> = Promise.resolve();

    private constructor(inner: ConfigStore, secrets: SecretStore, logger: Logger) {
        this.#inner = inner;
        this.#secrets = secrets;
        this.#logger = logger;
    }

    /** Build the store and run the one-time migration / hydration. */
    static async create(inner: ConfigStore, secrets: SecretStore, logger: Logger): Promise<VaultedConfigStore> {
        const store = new VaultedConfigStore(inner, secrets, logger);
        await store.#init();
        return store;
    }

    async #init(): Promise<void> {
        const disk = this.#inner.getConfig();
        this.#config = clone(disk);

        let available = false;
        try {
            available = await this.#secrets.available();
        } catch (e) {
            this.#logger.error("[config] secret store availability check failed", e);
        }
        if (!available) {
            this.#vaulting = false;
            // If disk secrets are already blank, they were likely vaulted by a prior run and are
            // now UNREADABLE (locked/inaccessible keychain) rather than simply unset — say so
            // loudly so an operator isn't left with a silently half-broken server.
            const maybeVaultedButUnreadable = SECRET_SPECS.some(s => !isNonEmpty(getPath(disk, s.path)));
            this.#logger.warn(
                maybeVaultedButUnreadable
                    ? "[config] secret store unavailable — any vaulted cloud credentials (FCM/Cloudflare/zrok/VAPID) cannot be loaded; push/DDNS/tunnel may not work until the login keychain is unlocked/accessible (audit F18)"
                    : "[config] secret store unavailable — credentials remain in the plaintext config DB (audit F18 inactive on this host)"
            );
            return;
        }
        this.#vaulting = true;

        // Process each secret independently and CONCURRENTLY (each is an isolated keychain
        // round-trip; serial spawns add ~5x boot latency). Each returns its key if it should be
        // redacted from disk. setPath into this.#config is synchronous, so no cross-spec races.
        const results = await Promise.all(SECRET_SPECS.map(spec => this.#initSpec(disk, spec)));
        const redactKeys = new Set<string>(results.filter((k): k is string => k != null));

        if (redactKeys.size > 0) {
            await this.#persistRedacted(this.#config, redactKeys);
            // Purge the just-overwritten plaintext bytes from the DB file (SQLite leaves them in
            // freelist pages otherwise) — one-time, only after a real migration.
            try {
                await this.#inner.compact?.();
            } catch (e) {
                this.#logger.error("[config] post-migration compaction failed (secrets are vaulted+redacted; old bytes may persist until next vacuum)", e);
            }
            this.#logger.info(
                `[config] moved ${redactKeys.size} credential(s) into the macOS Keychain and redacted them from config.db (audit F18)`
            );
        }
    }

    /** Migrate-or-hydrate one secret during init. Returns its key if it must be redacted from disk
     *  (i.e. it is now safely in the keychain), else null. Mutates this.#config to hold the value. */
    async #initSpec(disk: Config, spec: SecretSpec): Promise<string | null> {
        const diskVal = getPath(disk, spec.path);
        if (isNonEmpty(diskVal)) {
            // Plaintext on disk → move to keychain, verify readback, then mark for redaction.
            try {
                const serialized = spec.serialize(diskVal);
                await this.#secrets.set(spec.account, serialized);
                if ((await this.#secrets.get(spec.account)) !== serialized) throw new Error("readback mismatch");
                setPath(this.#config as unknown as Record<string, unknown>, spec.path, spec.deserialize(serialized));
                return spec.key;
            } catch (e) {
                this.#logger.error(`[config] could not vault ${spec.account}; leaving it in the config DB`, e);
                return null; // plaintext preserved on disk + in memory — no loss
            }
        }
        // Disk blank → hydrate from the keychain if a prior run stored it.
        try {
            const stored = await this.#secrets.get(spec.account);
            if (stored != null && stored.length > 0) {
                setPath(this.#config as unknown as Record<string, unknown>, spec.path, spec.deserialize(stored));
            }
        } catch (e) {
            this.#logger.error(`[config] could not read ${spec.account} from the keychain (its credential is unavailable this run)`, e);
        }
        return null;
    }

    /** Persist a copy of `hydrated` with the `redactKeys` secret leaves blanked (others kept). */
    async #persistRedacted(hydrated: Config, redactKeys: Set<string>): Promise<void> {
        const redacted = clone(hydrated) as unknown as Record<string, unknown>;
        for (const spec of SECRET_SPECS) {
            if (redactKeys.has(spec.key)) setPath(redacted, spec.path, undefined);
        }
        // `redacted` is the FULL config (every top-level key present), so the inner store's
        // shallow-merge persists exactly this — secrets blanked, everything else preserved.
        await this.#inner.setConfig(redacted as Partial<Config>);
    }

    getConfig(): Config {
        return this.#config;
    }

    async setConfig(patch: Partial<Config>): Promise<Config> {
        // Run writes one at a time. Each waits for the previous to commit, then reads the latest
        // this.#config — so the keychain awaits in #doSetConfig can't interleave a lost update.
        const task = this.#writeChain.then(() => this.#doSetConfig(patch));
        this.#writeChain = task.then(
            () => undefined,
            () => undefined
        );
        return task;
    }

    async #doSetConfig(patch: Partial<Config>): Promise<Config> {
        const merged = parseConfig({ ...this.#config, ...patch });

        if (!this.#vaulting) {
            this.#config = merged;
            await this.#inner.setConfig(merged);
            return merged;
        }

        const redactKeys = new Set<string>();
        for (const spec of SECRET_SPECS) {
            const val = getPath(merged, spec.path);
            if (isNonEmpty(val)) {
                try {
                    const serialized = spec.serialize(val);
                    await this.#secrets.set(spec.account, serialized);
                    if ((await this.#secrets.get(spec.account)) !== serialized) throw new Error("readback mismatch");
                    redactKeys.add(spec.key); // safe to remove from disk now
                } catch (e) {
                    this.#logger.error(`[config] could not vault ${spec.account} on save; it will be written to the config DB`, e);
                    // Not added to redactKeys → its plaintext value persists to disk. No loss.
                }
            } else {
                // Cleared → ensure the keychain no longer returns the old secret, so a failed
                // delete can't resurrect it on the next boot's hydrate. Delete is best-effort;
                // then INDEPENDENTLY verify and, if anything remains, overwrite with an empty
                // tombstone (hydrate ignores empty values). Keeping these in separate try blocks
                // means a delete() that throws still reaches the tombstone fallback.
                try {
                    await this.#secrets.delete(spec.account);
                } catch {
                    /* fall through to the verify+tombstone below */
                }
                try {
                    if ((await this.#secrets.get(spec.account)) != null) await this.#secrets.set(spec.account, "");
                } catch (e) {
                    this.#logger.error(`[config] could not clear ${spec.account} from the keychain (it may be re-loaded on restart)`, e);
                }
                redactKeys.add(spec.key);
            }
        }

        this.#config = merged;
        await this.#persistRedacted(merged, redactKeys);
        return merged;
    }

    listDevices(): Promise<Device[]> {
        return this.#inner.listDevices();
    }

    upsertDevice(device: Device): Promise<void> {
        return this.#inner.upsertDevice(device);
    }

    removeDevice(id: string): Promise<void> {
        return this.#inner.removeDevice(id);
    }
}
