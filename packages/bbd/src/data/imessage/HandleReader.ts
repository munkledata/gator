import type DatabaseType from "better-sqlite3";
import type { ColumnSet } from "./schema";

export const WANTED_HANDLE_COLUMNS: readonly string[] = [
    "ROWID",
    "id",
    "country",
    "service",
    "uncanonicalized_id"
];

export interface GetHandlesParams {
    limit?: number;
    offset?: number;
}

/** Read-only queries over the chat.db `handle` table. */
export class HandleReader {
    readonly #db: DatabaseType.Database;
    readonly #cols: string[];

    constructor(db: DatabaseType.Database, handle: ColumnSet) {
        this.#db = db;
        this.#cols = handle.project(WANTED_HANDLE_COLUMNS);
    }

    getHandles(params: GetHandlesParams = {}): Record<string, unknown>[] {
        const cols = this.#cols.map(c => `handle.${c}`).join(", ");
        const sql = `SELECT ${cols} FROM handle ORDER BY handle.ROWID ASC LIMIT @limit OFFSET @offset`;
        return this.#db.prepare(sql).all({ limit: params.limit ?? 1000, offset: params.offset ?? 0 }) as Record<
            string,
            unknown
        >[];
    }

    getHandle(address: string): Record<string, unknown> | undefined {
        const cols = this.#cols.map(c => `handle.${c}`).join(", ");
        const sql = `SELECT ${cols} FROM handle WHERE handle.id = @address LIMIT 1`;
        return this.#db.prepare(sql).get({ address }) as Record<string, unknown> | undefined;
    }

    /**
     * Batched handle lookup by ROWID for the `with: ["handle"]` incremental-sync
     * hydration: a message carries its sender's `handle_id` (the handle ROWID), so we
     * fetch all distinct ids in one query and key the result by ROWID for the handler to
     * attach each message's sender. Ids are bound as positional `?` params (never
     * interpolated). Version-safe: empty input or a degraded DB (no handle columns)
     * returns an empty Map.
     */
    getHandlesByRowIds(rowIds: number[]): Map<number, Record<string, unknown>> {
        const out = new Map<number, Record<string, unknown>>();
        if (rowIds.length === 0 || this.#cols.length === 0) return out;
        const placeholders = rowIds.map(() => "?").join(",");
        // Select ROWID explicitly to key the result; it's not in WANTED_HANDLE_COLUMNS as a
        // wire field, but serializeHandle only reads named columns (id/country/...), so a
        // stray ROWID on the row is harmless.
        const cols = this.#cols.map(c => `handle.${c}`).join(", ");
        const sql = `SELECT handle.ROWID AS __hrowid, ${cols} FROM handle WHERE handle.ROWID IN (${placeholders})`;
        const rows = this.#db.prepare(sql).all(...rowIds) as Record<string, unknown>[];
        for (const row of rows) {
            const rowId = Number(row["__hrowid"]);
            delete row["__hrowid"]; // keep the handle row clean for serializeHandle
            out.set(rowId, row);
        }
        return out;
    }
}
