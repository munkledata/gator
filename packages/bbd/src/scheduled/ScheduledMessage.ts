import { randomUUID } from "node:crypto";

/**
 * `sending` is the in-flight claim (audit F11): the scheduler atomically moves a `pending`
 * row to `sending` before it awaits the send, so an overlapping tick can't pick the same
 * row up again. A crash mid-send leaves an orphaned `sending` row, recovered by the startup
 * `resetStuck()` (sending -> pending).
 */
export type ScheduledMessageStatus = "pending" | "sending" | "sent" | "failed";

export interface ScheduledMessage {
    id: string;
    chatGuid: string;
    text: string;
    /** When to send, Unix ms. */
    scheduledFor: number;
    status: ScheduledMessageStatus;
    createdAt: number;
    error?: string;
}

export interface CreateScheduledMessage {
    chatGuid: string;
    text: string;
    scheduledFor: number;
}

/**
 * Persistence for scheduled messages. The {@link Scheduler} polls `due()` and sends;
 * implementations: in-memory (tests) and Drizzle (production). Scheduled messages
 * MUST survive a restart, so production uses the DB-backed store.
 */
export interface ScheduledMessageStore {
    create(input: CreateScheduledMessage): Promise<ScheduledMessage>;
    list(): Promise<ScheduledMessage[]>;
    get(id: string): Promise<ScheduledMessage | undefined>;
    delete(id: string): Promise<boolean>;
    /** Pending messages whose time has come (scheduledFor <= nowMs). */
    due(nowMs: number): Promise<ScheduledMessage[]>;
    /**
     * Atomically transition `pending` -> `sending` for this id, returning true iff THIS call
     * won the claim (the row was still `pending`). The scheduler calls it before sending so
     * two overlapping ticks can't both send the same message (audit F11). A second caller —
     * or a row already `sending`/`sent`/`failed` — gets false and skips.
     */
    claim(id: string): Promise<boolean>;
    /**
     * Recover crash-orphaned in-flight rows on startup: move every `sending` row back to
     * `pending` so it's re-claimed on the next tick. Returns the number reset.
     */
    resetStuck(): Promise<number>;
    markSent(id: string): Promise<void>;
    markFailed(id: string, error: string): Promise<void>;
}

export class InMemoryScheduledMessageStore implements ScheduledMessageStore {
    readonly #items = new Map<string, ScheduledMessage>();
    readonly #now: () => number;
    readonly #genId: () => string;

    constructor(opts: { now?: () => number; genId?: () => string } = {}) {
        this.#now = opts.now ?? (() => Date.now());
        this.#genId = opts.genId ?? randomUUID;
    }

    async create(input: CreateScheduledMessage): Promise<ScheduledMessage> {
        const msg: ScheduledMessage = {
            id: this.#genId(),
            chatGuid: input.chatGuid,
            text: input.text,
            scheduledFor: input.scheduledFor,
            status: "pending",
            createdAt: this.#now()
        };
        this.#items.set(msg.id, msg);
        return msg;
    }

    async list(): Promise<ScheduledMessage[]> {
        return [...this.#items.values()];
    }

    async get(id: string): Promise<ScheduledMessage | undefined> {
        return this.#items.get(id);
    }

    async delete(id: string): Promise<boolean> {
        return this.#items.delete(id);
    }

    async due(nowMs: number): Promise<ScheduledMessage[]> {
        return [...this.#items.values()].filter(m => m.status === "pending" && m.scheduledFor <= nowMs);
    }

    async claim(id: string): Promise<boolean> {
        const m = this.#items.get(id);
        // Single-threaded JS: the get/check/set runs atomically with no await between, so
        // exactly one caller sees `pending` and wins. (The Drizzle store uses a conditional
        // UPDATE ... RETURNING for the same guarantee against concurrent processes.)
        if (!m || m.status !== "pending") return false;
        m.status = "sending";
        return true;
    }

    async resetStuck(): Promise<number> {
        let n = 0;
        for (const m of this.#items.values()) {
            if (m.status === "sending") {
                m.status = "pending";
                n++;
            }
        }
        return n;
    }

    async markSent(id: string): Promise<void> {
        const m = this.#items.get(id);
        if (m) m.status = "sent";
    }

    async markFailed(id: string, error: string): Promise<void> {
        const m = this.#items.get(id);
        if (m) {
            m.status = "failed";
            m.error = error;
        }
    }
}
