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

startBbdBackend({
    userDataPath: process.env.BBD_USER_DATA,
    messagesDir: process.env.BBD_MESSAGES_DIR,
    port: toPort(process.env.BBD_PORT),
    password: process.env.BBD_PASSWORD,
    privateApiSecret: process.env.BBD_PA_SECRET,
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
