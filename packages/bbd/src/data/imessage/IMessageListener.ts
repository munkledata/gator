import type { EventBus } from "../../core/bus";
import type { Logger } from "../../core/logger";
import type { DomainEvents } from "../../events";
import type { MessageReader } from "./MessageReader";
import { type Cursor, INITIAL_CURSOR } from "./cursor";

/** Persistence for the detection cursor (e.g. a row in the config DB). */
export interface CursorStore {
    load(): Promise<Cursor>;
    save(cursor: Cursor): Promise<void>;
}

const asNumber = (v: unknown): number => (typeof v === "number" ? v : 0);

/**
 * Turns chat.db deltas into domain events.
 *
 * On each `poll()` (driven by the watcher), it reads everything new/updated since
 * the persisted cursor and emits `new-message` for fresh inserts (ROWID beyond the
 * previous high-water mark) and `updated-message` for rows that came back because a
 * tracked date advanced (edit, unsend, delivery/read receipt). The cursor is then
 * advanced and persisted, so a restart resumes exactly where it left off. This is
 * the same event surface the legacy `IMessageListener` exposed, so downstream
 * (the serializer, sinks) is unaffected.
 */
export class IMessageListener {
    readonly #reader: MessageReader;
    readonly #cursorStore: CursorStore;
    readonly #bus: EventBus<DomainEvents>;
    readonly #logger: Logger;
    #cursor: Cursor = INITIAL_CURSOR;

    constructor(reader: MessageReader, cursorStore: CursorStore, bus: EventBus<DomainEvents>, logger: Logger) {
        this.#reader = reader;
        this.#cursorStore = cursorStore;
        this.#bus = bus;
        this.#logger = logger.child({ component: "IMessageListener" });
    }

    async init(): Promise<void> {
        this.#cursor = await this.#cursorStore.load();
    }

    get cursor(): Cursor {
        return this.#cursor;
    }

    /** Read the delta since the cursor, emit events, advance + persist the cursor. */
    async poll(): Promise<number> {
        const previous = this.#cursor;
        // A transient chat.db read failure (SQLITE_BUSY/IOERR while Messages is writing) must
        // degrade to "no changes this tick" + a log, never throw out of poll (audit F19). The
        // cursor is untouched, so the next watcher tick re-reads the same delta — no loss.
        let result: { rows: Record<string, unknown>[]; cursor: Cursor };
        try {
            result = this.#reader.readSince(previous);
        } catch (e) {
            this.#logger.error("readSince failed; skipping this poll (cursor unchanged)", e);
            return 0;
        }
        const { rows, cursor } = result;

        for (const row of rows) {
            const isNew = asNumber(row["ROWID"]) > previous.lastRowId;
            this.#bus.emit(isNew ? "new-message" : "updated-message", row);
        }

        if (rows.length > 0) {
            this.#cursor = cursor;
            await this.#cursorStore.save(cursor);
            this.#logger.debug(`emitted ${rows.length} change(s); cursor at ROWID ${cursor.lastRowId}`);
        }
        return rows.length;
    }
}
