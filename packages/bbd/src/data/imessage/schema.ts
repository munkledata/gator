import type DatabaseType from "better-sqlite3";

/**
 * Runtime schema introspection — the single most important resilience win.
 *
 * The legacy server hard-mirrors Apple's private schema in TypeORM entities, so a
 * new macOS release that adds columns leaves them unmapped and a *removed* column
 * throws. Here we ask the DB what columns it actually has (`PRAGMA table_info`),
 * project only those, and derive feature availability from column presence. A new
 * column is ignored; a missing column degrades a feature instead of crashing. This
 * ends the per-OS hand-gating treadmill.
 */

export class ColumnSet {
    readonly #columns: Set<string>;

    constructor(columns: Iterable<string>) {
        this.#columns = new Set(columns);
    }

    has(column: string): boolean {
        return this.#columns.has(column);
    }

    /** Of `wanted`, keep only the columns that actually exist. */
    project(wanted: readonly string[]): string[] {
        return wanted.filter(c => this.#columns.has(c));
    }

    get all(): string[] {
        return [...this.#columns];
    }

    get size(): number {
        return this.#columns.size;
    }
}

interface PragmaColumnInfo {
    name: string;
}

function quoteIdent(ident: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
        throw new Error(`unsafe SQL identifier: ${ident}`);
    }
    return `"${ident}"`;
}

export function tableExists(db: DatabaseType.Database, table: string): boolean {
    return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table) != null;
}

export function introspectTable(db: DatabaseType.Database, table: string): ColumnSet {
    const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as PragmaColumnInfo[];
    return new ColumnSet(rows.map(r => r.name));
}

/** The introspected shape of a chat.db, with feature flags derived from columns. */
export interface IMessageSchema {
    message: ColumnSet;
    chat: ColumnSet;
    handle: ColumnSet;
    attachment: ColumnSet;
    /** date_edited / date_retracted (macOS 13+). */
    hasEditColumns: boolean;
    /** thread_originator_guid (macOS 11+). */
    hasThreadColumns: boolean;
    /** attributedBody blob (modern message text storage). */
    hasAttributedBody: boolean;
    /** did_notify_recipient (macOS 12+, "notify anyways"). */
    hasNotifyColumn: boolean;
}

export function introspectSchema(db: DatabaseType.Database): IMessageSchema {
    const message = introspectTable(db, "message");
    return {
        message,
        chat: introspectTable(db, "chat"),
        handle: introspectTable(db, "handle"),
        attachment: introspectTable(db, "attachment"),
        hasEditColumns: message.has("date_edited") && message.has("date_retracted"),
        hasThreadColumns: message.has("thread_originator_guid"),
        hasAttributedBody: message.has("attributedBody"),
        hasNotifyColumn: message.has("did_notify_recipient")
    };
}
