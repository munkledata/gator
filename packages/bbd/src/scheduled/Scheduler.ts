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

    async start(): Promise<void> {
        // Recover any rows orphaned mid-send by a previous crash (sending -> pending) BEFORE
        // the first tick, so they're eligible to be re-claimed (audit F11).
        try {
            const recovered = await this.#store.resetStuck();
            if (recovered > 0) this.#logger.info(`reset ${recovered} crash-orphaned scheduled message(s) to pending`);
        } catch (e) {
            this.#logger.error("failed to reset stuck scheduled messages on startup", e);
        }
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
            // Atomically claim the row (pending -> sending) before sending. If a concurrent
            // tick already claimed it (claim() === false), skip — this is the lock that
            // prevents the double-send the bare `due()` loop allowed (audit F11). The row is
            // not `pending` for the await window, so an overlapping tick's `due()` won't even
            // return it; claim() closes the residual race between due() and claim().
            if (!(await this.#store.claim(msg.id))) continue;
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
