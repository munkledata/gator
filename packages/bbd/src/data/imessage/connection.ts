import Database from "better-sqlite3";

export interface ChatDbOptions {
    /** SQLITE_BUSY retry window against the live WAL Messages.app is writing. */
    busyTimeoutMs?: number;
}

/**
 * Open Apple's chat.db **strictly read-only**.
 *
 * The legacy server opens chat.db through a read-write DataSource with no `readonly`
 * flag — one stray `save()`/migration would attempt to mutate Apple's database. Here
 * the handle is read-only by construction (`readonly: true` + `PRAGMA query_only`),
 * so corruption is structurally impossible, and `busy_timeout` handles SQLITE_BUSY
 * against the live WAL that Messages.app is concurrently writing.
 */
export function openReadOnlyChatDb(dbPath: string, opts: ChatDbOptions = {}): Database.Database {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma("query_only = 1");
    db.pragma(`busy_timeout = ${opts.busyTimeoutMs ?? 5000}`);
    return db;
}
