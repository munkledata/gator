import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type DatabaseType from "better-sqlite3";
import * as bplist from "bplist-parser";
import { decryptLocalStorageDb } from "./localStorage";
import { LOCAL_STORAGE_DB_PATH } from "../paths";

// Lazy-load the native better-sqlite3 only when we actually decrypt, so importing this module
// (transitively, via FindMyService) doesn't pull in the native addon.
const requireCjs = createRequire(import.meta.url);

/** A friend coordinate row decrypted from LocalStorage.db. Ported from upstream PR #810. */
export type RawFriendLocation = {
    /** Stable Find My identifier (serverUserID / serverID), trailing `~` stripped. */
    findMyId: string;
    /** Owner handle (email / phone) if resolvable from the `friends` table. */
    handle: string | null;
    /** Full parsed `secureLocations.value` plist (lat/long/timestamp/accuracy/...). */
    location: Record<string, any>;
};

const stripPadding = (id: string): string => (id ?? "").replace(/~+$/, "");

/**
 * Decrypt LocalStorage.db to a temporary plaintext SQLite file, run `fn` against it, then delete
 * the temp file. The plaintext holds real private coordinates, so it is always cleaned up — even on
 * error (0600, in the OS temp dir).
 */
const withDecryptedDb = <T>(key: Buffer, fn: (db: DatabaseType.Database) => T): T => {
    const Database = requireCjs("better-sqlite3") as typeof DatabaseType;
    const tmpPath = path.join(os.tmpdir(), `findmy-localstorage-${randomUUID()}.sqlite`);
    const decrypted = decryptLocalStorageDb(key, LOCAL_STORAGE_DB_PATH);
    fs.writeFileSync(tmpPath, decrypted, { mode: 0o600 });

    let db: DatabaseType.Database | null = null;
    try {
        db = new Database(tmpPath, { readonly: true, fileMustExist: true });
        return fn(db);
    } finally {
        try {
            db?.close();
        } catch {
            // ignore
        }
        try {
            fs.unlinkSync(tmpPath);
        } catch {
            // ignore
        }
    }
};

/** Column names for a table (empty if the table doesn't exist). */
const tableColumns = (db: DatabaseType.Database, table: string): Set<string> => {
    try {
        const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        return new Set(rows.map((r) => r.name));
    } catch {
        return new Set();
    }
};

/**
 * Reads + joins friend coordinates from the decrypted LocalStorage.db.
 * - `secureLocations` holds one coordinate plist per friend (keyed by serverUserID).
 * - `friends` maps serverID -> handleIdentifier (email/phone).
 */
export const readFriendLocations = (key: Buffer): RawFriendLocation[] => {
    return withDecryptedDb(key, (db): RawFriendLocation[] => {
        // findMyId -> handle (defensive about column names). A single findMyId can have multiple
        // handle rows (email + phone) — prefer the email-style handle.
        const handleById: Record<string, string> = {};
        const friendCols = tableColumns(db, "friends");
        const idCol = friendCols.has("handleServerIdentifier")
            ? "handleServerIdentifier"
            : friendCols.has("serverID")
              ? "serverID"
              : null;
        const handleCol = friendCols.has("handleIdentifier") ? "handleIdentifier" : null;
        if (idCol && handleCol) {
            const rows = db
                .prepare(`SELECT ${idCol} as fid, ${handleCol} as handle FROM friends`)
                .all() as Array<{ fid: unknown; handle: unknown }>;
            for (const row of rows) {
                const fid = stripPadding(String(row.fid ?? ""));
                const handle = row.handle ? String(row.handle) : null;
                if (!fid || !handle) continue;
                if (!handleById[fid] || (!handleById[fid]!.includes("@") && handle.includes("@"))) {
                    handleById[fid] = handle;
                }
            }
        }

        const out: RawFriendLocation[] = [];
        const locCols = tableColumns(db, "secureLocations");
        if (!locCols.has("value")) return out;
        const locIdCol = locCols.has("serverUserID")
            ? "serverUserID"
            : locCols.has("serverID")
              ? "serverID"
              : null;
        if (!locIdCol) return out;

        const rows = db
            .prepare(`SELECT ${locIdCol} as id, value FROM secureLocations`)
            .all() as Array<{ id: unknown; value: unknown }>;
        for (const row of rows) {
            const fid = stripPadding(String(row.id ?? ""));
            if (!fid || row.value == null) continue;
            try {
                const valueBuf = Buffer.isBuffer(row.value) ? row.value : Buffer.from(row.value as ArrayBuffer);
                const parsed = bplist.parseBuffer(valueBuf)[0] as Record<string, any>;
                out.push({ findMyId: fid, handle: handleById[fid] ?? null, location: parsed });
            } catch {
                // skip unparseable rows
            }
        }

        return out;
    });
};

/**
 * Diagnostic: dump tables + columns + row counts of the decrypted LocalStorage.db. Useful on a real
 * machine to confirm the schema (where coordinates/handles live). Never logs coordinate values.
 */
export const dumpLocalStorageSchema = (
    key: Buffer
): Record<string, { columns: string[]; rowCount: number }> => {
    return withDecryptedDb(key, (db) => {
        const tables = db
            .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
            .all() as Array<{ name: string }>;

        const schema: Record<string, { columns: string[]; rowCount: number }> = {};
        for (const { name } of tables) {
            const columns = [...tableColumns(db, name)];
            let rowCount = 0;
            try {
                rowCount = (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number }).c;
            } catch {
                // ignore
            }
            schema[name] = { columns, rowCount };
        }
        return schema;
    });
};
