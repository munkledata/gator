/**
 * The host-platform boundary — and the ONLY file in bbd allowed to import
 * "electron" (enforced by the no-restricted-imports rule in eslint.config.mjs).
 *
 * Why this matters: in the legacy server, `import { app } from "electron"` is
 * sprinkled across dozens of files, fusing the backend to Electron. That single
 * fact is what turns the eventual headless (launchd `LaunchAgent`) extraction
 * into a rewrite. Here, the rest of the daemon depends only on {@link HostPlatform};
 * during migration we register the Electron-backed implementation, and the final
 * "de-Electron" phase swaps in {@link HeadlessHostPlatform} with zero changes
 * upstream.
 */

import os from "node:os";
import path from "node:path";

export interface HostPlatform {
    readonly kind: "electron" | "headless";
    /** Where mutable app data (config.db, themes, …) is stored. */
    userDataPath(): string;
    /** Where logs are written. */
    logsPath(): string;
    /** Register a hook to run during graceful shutdown (before the process exits). */
    onBeforeQuit(handler: () => Promise<void> | void): void;
    /** Request process termination. */
    quit(code?: number): void;
}

const APP_DIR = "bluebubbles-server";

/**
 * The headless implementation — no Electron, suitable for a launchd LaunchAgent.
 * This is the *destination* of the strangler migration; it already works today
 * for headless/CI contexts and needs no GUI session.
 */
export class HeadlessHostPlatform implements HostPlatform {
    readonly kind = "headless" as const;
    readonly #quitHandlers: Array<() => Promise<void> | void> = [];
    #wired = false;

    userDataPath(): string {
        return path.join(os.homedir(), "Library", "Application Support", APP_DIR);
    }

    logsPath(): string {
        return path.join(os.homedir(), "Library", "Logs", APP_DIR);
    }

    onBeforeQuit(handler: () => Promise<void> | void): void {
        this.#quitHandlers.push(handler);
        if (this.#wired) return;
        this.#wired = true;
        const run = async (): Promise<void> => {
            for (const h of this.#quitHandlers) {
                try {
                    await h();
                } catch {
                    /* a failing shutdown hook must not block the others */
                }
            }
        };
        process.once("SIGTERM", () => void run().finally(() => process.exit(0)));
        process.once("SIGINT", () => void run().finally(() => process.exit(0)));
    }

    quit(code = 0): void {
        process.exit(code);
    }
}

/**
 * The Electron-backed implementation lives in THIS file too (so it stays the only
 * place importing "electron"). It is intentionally not yet wired up — bbd is a
 * Phase-0 scaffold and Electron is not a dependency of this package. When the
 * legacy app begins delegating to bbd, add it here:
 *
 *   import { app } from "electron";                      // allowed only in this file
 *   export class ElectronHostPlatform implements HostPlatform {
 *       readonly kind = "electron" as const;
 *       userDataPath() { return app.getPath("userData"); }
 *       logsPath()     { return path.join(app.getPath("logs")); }
 *       onBeforeQuit(h) { app.on("before-quit", () => void h()); }
 *       quit(code = 0) { app.exit(code); }
 *   }
 *
 * Selecting which one to register is the host's single Electron decision point.
 */
