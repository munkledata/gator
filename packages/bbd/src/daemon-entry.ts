import { startBbdBackend } from "./backend";
import { createConsoleLogger } from "./core/logger";

/**
 * The entry the Electron shell forks with `utilityProcess.fork()`. It runs the bbd
 * backend in its own Node process (so the ESM bbd never has to interleave with the
 * CJS webpack-bundled Electron main), reading all host-specific config from env that
 * the parent injects: Electron's userData path, the chosen port/password, and the
 * bundled UI directory. On boot it posts a `ready` message back over `parentPort`.
 */
const toPort = (v: string | undefined): number | undefined => (v && /^\d+$/.test(v) ? Number(v) : undefined);

const logger = createConsoleLogger("bbd");

interface ParentPort {
    postMessage(message: unknown): void;
}
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;

// Hot-path resilience (audit F19): a transient rejection/throw on the per-message ingestion
// path (a flaky chat.db read, a webhook fetch, a push send) must NOT take the whole daemon
// down — that turns one bad message into a service outage and a watchdog respawn loop. LOG
// and keep running. We deliberately do NOT exit here: only a genuine fatal startup error
// (the `.catch` on startBbdBackend below, which calls process.exit) should stop the process
// so the parent/launchd watchdog respawns it. A truly corrupt state is still observable via
// the logs; staying up keeps every other channel (socket, REST, scheduler) alive.
process.on("unhandledRejection", reason => {
    logger.error("unhandledRejection on the bbd hot path (continuing)", reason);
});
process.on("uncaughtException", err => {
    logger.error("uncaughtException on the bbd hot path (continuing)", err);
});

startBbdBackend({
    userDataPath: process.env.BBD_USER_DATA,
    messagesDir: process.env.BBD_MESSAGES_DIR,
    port: toPort(process.env.BBD_PORT),
    password: process.env.BBD_PASSWORD,
    // Per-boot local-trust token the shell shares with its renderer (audit S1).
    localAuthToken: process.env.BBD_LOCAL_AUTH || undefined,
    // Plain HTTP stays loopback-only unless the host explicitly opts in (audit S4).
    bindAll: process.env.BBD_BIND_ALL === "1",
    privateApiSecret: process.env.BBD_PA_SECRET,
    zrokBinPath: process.env.BBD_ZROK_BIN || undefined,
    serveUiFrom: process.env.BBD_UI_DIR,
    logger
})
    .then(running => {
        logger.info(`bbd backend ready on :${running.port}`);
        parentPort?.postMessage({ type: "ready", port: running.port });
        const shutdown = (): void => {
            void running.stop().finally(() => process.exit(0));
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    })
    .catch((err: unknown) => {
        logger.error("bbd backend failed to start", err);
        parentPort?.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
        process.exit(1);
    });
