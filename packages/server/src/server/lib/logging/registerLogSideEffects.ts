import { Server } from "@server";
import { AlertsInterface } from "@server/api/interfaces/alertsInterface";
import { LogBus, LogRecord } from "./LogBus";

let registered = false;

/**
 * Subscribes the UI / alerts / dock-badge side effects to {@link LogBus}.
 *
 * These behaviors used to live *inside* `Server.log()`, which is what forced the
 * `Logger -> Server` circular dependency. Moving them to a subscriber makes
 * logging a one-way producer and the UI just another consumer. Behavior is
 * preserved 1:1 with the legacy `Server.log()` body (alert on warn/error, bump
 * the notification count, badge on error, emit `new-log` to the UI on every
 * record), but a failure in a side effect can no longer break the log call.
 */
export function registerLogSideEffects(): void {
    if (registered) return;
    registered = true;

    LogBus.onRecord((record: LogRecord) => {
        try {
            const server = Server();
            if (!server) return;

            if (record.level === "error" || record.level === "warn") {
                AlertsInterface.create(record.level, record.line);
                server.notificationCount += 1;
                if (record.level === "error") {
                    server.setNotificationCount(server.notificationCount);
                }
            }

            // Mirrors the legacy emitToUI("new-log", { message, type: type ?? "log" }).
            server.emitToUI("new-log", {
                message: record.line,
                type: record.level === "info" ? "log" : record.level
            });
        } catch {
            // A logging side effect must never throw back into the logger.
        }
    });
}
