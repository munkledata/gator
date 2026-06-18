import type { ColumnSet } from "./schema";

/**
 * A durable detection cursor.
 *
 * Replaces the legacy "poll a 1-week window on every WAL write + filter in JS +
 * volatile in-memory de-dup cache" with a high-water mark persisted to disk. New
 * inserts are caught by ROWID; updates to existing rows (edits, retractions,
 * delivery/read-receipt changes) are caught by the per-field max dates. It survives
 * restarts and can neither miss nor re-emit.
 */
export interface Cursor {
    lastRowId: number;
    /** Raw Apple dates (nanoseconds) — compared directly against the stored columns. */
    maxDate: number;
    maxDateEdited: number;
    maxDateRetracted: number;
    maxDateDelivered: number;
    maxDateRead: number;
}

export const INITIAL_CURSOR: Cursor = {
    lastRowId: 0,
    maxDate: 0,
    maxDateEdited: 0,
    maxDateRetracted: 0,
    maxDateDelivered: 0,
    maxDateRead: 0
};

const DATE_FIELDS: readonly [column: string, cursorKey: keyof Cursor][] = [
    ["date", "maxDate"],
    ["date_edited", "maxDateEdited"],
    ["date_retracted", "maxDateRetracted"],
    ["date_delivered", "maxDateDelivered"],
    ["date_read", "maxDateRead"]
];

/**
 * Build the delta WHERE clause + params, including only the date columns that
 * actually exist on this macOS version (e.g. date_edited is absent pre-13). A row
 * qualifies if its ROWID is new OR any tracked date has advanced past the cursor.
 */
export function buildDeltaQuery(
    cursor: Cursor,
    message: ColumnSet
): { where: string; params: Record<string, number> } {
    const clauses = ["message.ROWID > @lastRowId"];
    const params: Record<string, number> = { lastRowId: cursor.lastRowId };
    for (const [column, key] of DATE_FIELDS) {
        if (message.has(column)) {
            clauses.push(`message.${column} > @${key}`);
            params[key] = cursor[key];
        }
    }
    return { where: clauses.join(" OR "), params };
}

const asNumber = (v: unknown): number => (typeof v === "number" ? v : 0);

/** Advance a cursor over a batch of rows (the new high-water marks). */
export function advanceCursor(cursor: Cursor, rows: readonly Record<string, unknown>[]): Cursor {
    const next: Cursor = { ...cursor };
    for (const row of rows) {
        next.lastRowId = Math.max(next.lastRowId, asNumber(row["ROWID"]));
        next.maxDate = Math.max(next.maxDate, asNumber(row["date"]));
        next.maxDateEdited = Math.max(next.maxDateEdited, asNumber(row["date_edited"]));
        next.maxDateRetracted = Math.max(next.maxDateRetracted, asNumber(row["date_retracted"]));
        next.maxDateDelivered = Math.max(next.maxDateDelivered, asNumber(row["date_delivered"]));
        next.maxDateRead = Math.max(next.maxDateRead, asNumber(row["date_read"]));
    }
    return next;
}
