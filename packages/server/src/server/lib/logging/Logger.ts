import ServerLog from "electron-log";
import EventEmitter from "events";
import { LogBus, LogLevel } from "./LogBus";

/**
 * A per-tag logger.
 *
 * It writes to the electron-log transport and publishes a structured record to
 * {@link LogBus}. Crucially it no longer imports `Server` — that import, and the
 * `Server().log()` call it wrapped, were the `Logger -> Server` circular
 * dependency. Side effects (alerts, the dock badge, UI emission) are now handled
 * by subscribers (see registerLogSideEffects).
 *
 * The public API (`info`/`debug`/`warn`/`error`) and the per-logger `"log"` event
 * (used by `Loggable.onLog`) are unchanged, so the 21 call sites need no edits.
 */
export class Logger extends EventEmitter {
    tag: string;

    constructor(tag: string) {
        super();
        this.tag = tag;
    }

    private write(level: LogLevel, message: string): void {
        const line = `[${this.tag}] ${message}`;
        switch (level) {
            case "error":
                ServerLog.error(line);
                break;
            case "warn":
                ServerLog.warn(line);
                break;
            case "debug":
                ServerLog.debug(line);
                break;
            case "info":
            default:
                ServerLog.log(line);
        }
        LogBus.emitRecord({ level, line, tag: this.tag, timestamp: Date.now() });
        this.emit("log", message);
    }

    info(message: string) {
        this.write("info", message);
    }

    debug(message: string) {
        this.write("debug", message);
    }

    error(message: string) {
        this.write("error", message);
    }

    warn(message: string) {
        this.write("warn", message);
    }
}
