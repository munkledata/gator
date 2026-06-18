import { EventEmitter } from "events";

/**
 * The decoupling point for logging side effects.
 *
 * Historically the `Logger` imported `Server` and every log call ran through
 * `Server().log()`, which mutated `notificationCount`, created alerts, and emitted
 * to the UI — a hard `Logger -> Server` circular dependency. Now both the per-tag
 * `Logger` and `Server.log()` simply write to the underlying transport and emit a
 * structured {@link LogRecord} here. Anything that wants to *react* to logs (the
 * UI, the alerts panel, the dock badge) subscribes — it is never reached into by
 * the logger.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
    level: LogLevel;
    /** The fully-formatted log line (already includes any `[tag]` prefix). */
    line: string;
    tag?: string;
    timestamp: number;
}

/** Render an arbitrary log message to a single line (objects/errors don't become "[object Object]"). */
export function formatLogLine(message: unknown): string {
    if (typeof message === "string") return message;
    if (message instanceof Error) return message.stack ?? `${message.name}: ${message.message}`;
    try {
        return JSON.stringify(message);
    } catch {
        return String(message);
    }
}

class LogBusImpl extends EventEmitter {
    // Buffer records emitted before the first subscriber (e.g. logs during early
    // bootstrap, before registerLogSideEffects runs in start()) and replay them on
    // first subscribe — so no alert/UI side effect is silently dropped.
    #buffer: LogRecord[] = [];
    #flushed = false;

    emitRecord(record: LogRecord): void {
        if (!this.#flushed) {
            this.#buffer.push(record);
            if (this.#buffer.length > 500) this.#buffer.shift();
        }
        this.emit("record", record);
    }

    /** Subscribe to every log record (replaying any buffered ones). Returns an unsubscribe function. */
    onRecord(listener: (record: LogRecord) => void): () => void {
        if (!this.#flushed) {
            this.#flushed = true;
            const buffered = this.#buffer;
            this.#buffer = [];
            for (const record of buffered) listener(record);
        }
        this.on("record", listener);
        return () => this.off("record", listener);
    }
}

export const LogBus = new LogBusImpl();
// Logging can be very chatty; avoid the EventEmitter max-listener warning.
LogBus.setMaxListeners(0);
