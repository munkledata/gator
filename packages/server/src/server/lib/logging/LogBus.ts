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

class LogBusImpl extends EventEmitter {
    emitRecord(record: LogRecord): void {
        this.emit("record", record);
    }

    /** Subscribe to every log record. Returns an unsubscribe function. */
    onRecord(listener: (record: LogRecord) => void): () => void {
        this.on("record", listener);
        return () => this.off("record", listener);
    }
}

export const LogBus = new LogBusImpl();
// Logging can be very chatty; avoid the EventEmitter max-listener warning.
LogBus.setMaxListeners(0);
