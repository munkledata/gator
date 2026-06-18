import { randomUUID } from "node:crypto";

export type ScheduledMessageStatus = "pending" | "sent" | "failed";

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
