import type { Logger } from "../core/logger";
import type { MessageSender } from "../messaging/MessageSender";
import type { ScheduledMessageStore } from "./ScheduledMessage";

export interface SchedulerOptions {
    /** How often to check for due messages. */
    intervalMs?: number;
    now?: () => number;
}

/**
 * Sends scheduled messages when their time comes. A supervised service: `start()`
 * runs a periodic `tick()` that pulls due messages from the store and sends each via
 * the {@link MessageSender}, marking it sent or failed. Because due-ness is computed
 * from a persisted `scheduledFor`, a restart resumes correctly (the legacy
 * ScheduledMessagesService used calendar-naive math; due-by-timestamp avoids that).
 */
export class Scheduler {
    readonly #store: ScheduledMessageStore;
    readonly #sender: MessageSender;
    readonly #logger: Logger;
    readonly #intervalMs: number;
    readonly #now: () => number;
    #timer: NodeJS.Timeout | undefined;

    constructor(store: ScheduledMessageStore, sender: MessageSender, logger: Logger, opts: SchedulerOptions = {}) {
        this.#store = store;
        this.#sender = sender;
        this.#logger = logger.child({ component: "Scheduler" });
        this.#intervalMs = opts.intervalMs ?? 15_000;
        this.#now = opts.now ?? (() => Date.now());
    }

    start(): void {
        this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
        this.#timer.unref?.();
    }

    stop(): void {
        if (this.#timer) clearInterval(this.#timer);
        this.#timer = undefined;
    }

    /** Send every currently-due message; returns the count sent. */
    async tick(): Promise<number> {
        const due = await this.#store.due(this.#now());
        let sent = 0;
        for (const msg of due) {
            try {
                await this.#sender.sendText({ chatGuid: msg.chatGuid, text: msg.text });
                await this.#store.markSent(msg.id);
                sent++;
            } catch (e) {
                this.#logger.error(`scheduled message ${msg.id} failed`, e);
                await this.#store.markFailed(msg.id, e instanceof Error ? e.message : String(e));
            }
        }
        return sent;
    }
}
