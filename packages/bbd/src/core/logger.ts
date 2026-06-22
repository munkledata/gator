/**
 * Logging as an injectable abstraction.
 *
 * In the legacy server, `Logger.ts` imports `Server`, and every log call funnels
 * through `Server().log()`, which mutates `notificationCount`, pokes the alerts
 * interface, and emits to the UI — a hard circular dependency that makes the
 * god-object impossible to isolate or test.
 *
 * bbd inverts this: the core depends only on the {@link Logger} interface. The
 * production implementation wraps pino (a structured, standalone logger) and the
 * UI/alerts become *subscribers to the event bus*, never something logging reaches
 * back into. Keeping the core pino-free is deliberate — it keeps logging a
 * dependency-light seam and lets tests inject a capturing logger.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface Logger {
    trace(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    fatal(msg: string, ...args: unknown[]): void;
    /** Derive a logger that tags every line with additional bindings. */
    child(bindings: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60
};

interface ConsoleLoggerOptions {
    level?: LogLevel;
    bindings?: Record<string, unknown>;
    /** Sink, primarily for tests. Defaults to console. */
    sink?: (level: LogLevel, line: string, bindings: Record<string, unknown>) => void;
}

/**
 * A zero-dependency Logger used by the scaffold and tests. The production daemon
 * registers a pino-backed Logger in the container instead — same interface, so no
 * upstream code changes. (See package.json `//note-pino`.)
 */
export function createConsoleLogger(name: string, opts: ConsoleLoggerOptions = {}): Logger {
    const threshold = LEVEL_ORDER[opts.level ?? "info"];
    const bindings = { component: name, ...opts.bindings };
    const sink =
        opts.sink ??
        ((level, line) => {
            const fn = level === "error" || level === "fatal" ? console.error : console.log;
            fn(line);
        });

    const log = (level: LogLevel, msg: string, args: unknown[]): void => {
        if (LEVEL_ORDER[level] < threshold) return;
        const suffix = args.length ? " " + args.map(stringify).join(" ") : "";
        sink(level, `[${level}] ${name}: ${msg}${suffix}`, bindings);
    };

    return {
        trace: (m, ...a) => log("trace", m, a),
        debug: (m, ...a) => log("debug", m, a),
        info: (m, ...a) => log("info", m, a),
        warn: (m, ...a) => log("warn", m, a),
        error: (m, ...a) => log("error", m, a),
        fatal: (m, ...a) => log("fatal", m, a),
        child: extra => createConsoleLogger(name, { ...opts, bindings: { ...bindings, ...extra } })
    };
}

/**
 * Keys whose VALUES are redacted before a logged object is serialized (audit F26): a
 * defense-in-depth net so a logger arg that happens to carry a credential (a config blob, an
 * FCM service account, an Authorization header) doesn't write the secret to the log sink. This
 * is a best-effort scrub on the structured-arg path, NOT a substitute for never logging
 * secrets — string interpolation (`logger.info(\`token=\${t}\`)`) is already-flattened text and
 * cannot be scrubbed here.
 */
const SECRET_KEY_RE = /password|token|secret|private_key|privatekey|authorization|api[-_]?key|credential/i;
const REDACTED = "[redacted]";

/** Recursively copy a value, replacing secret-keyed leaves with a placeholder. Cycle-safe. */
const redact = (v: unknown, seen: WeakSet<object>): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(item => redact(item, seen));
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redact(val, seen);
    }
    return out;
};

const stringify = (v: unknown): string => {
    if (v instanceof Error) return v.stack ?? `${v.name}: ${v.message}`;
    if (typeof v === "object" && v !== null) {
        try {
            return JSON.stringify(redact(v, new WeakSet<object>()));
        } catch {
            return String(v);
        }
    }
    return String(v);
};
