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
}
