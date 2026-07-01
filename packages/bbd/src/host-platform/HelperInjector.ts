import { spawn } from "node:child_process";
import fs from "node:fs";
import type { Logger } from "../core/logger";

/**
 * Loads the Private-API helper dylib INTO Messages.app / FaceTime.app.
 *
 * The new daemon owns the UDS transport + writes the handshake rendezvous file, but the
 * legacy "god-object server" that actually injected the dylib was removed and never
 * reimplemented — so nothing was loading the helper into the target apps (the daemon just
 * listened on a socket no one ever connected to). This restores that step, mirroring the
 * legacy `ProcessDylibMode`/`DylibPlugin`: for each enabled target, kill the app, relaunch
 * its real binary with `DYLD_INSERT_LIBRARIES=<dylib>` (requires SIP off + AMFI relaxed),
 * hide it, and re-inject whenever it exits. Messages and FaceTime use SEPARATE UDS sockets
 * (the transport is single-client), so each dylib reads its OWN rendezvous file.
 *
 * Daemon-direct spawn: we run as a utilityProcess child of the Electron app, i.e. inside the
 * user's Aqua/GUI session, so a spawned app binary attaches to WindowServer.
 */

/** A target app to keep injected, re-evaluated against config each cycle. */
export interface InjectableTarget {
    /** Process + .app name, e.g. "Messages" / "FaceTime". */
    appName: string;
    /** Absolute path to the bundled dylib to inject. */
    dylibPath: string;
    /** Re-read each cycle so a runtime config toggle takes effect. */
    isEnabled: () => boolean;
}

/** Side-effecting OS calls, injected so the lifecycle is unit-testable. */
export interface HelperProcessRunner {
    /** Resolve the app's executable (tries /System/Applications then /Applications). */
    resolveAppBinary(appName: string): string | null;
    /** Best-effort terminate of the running app. */
    killApp(appName: string): Promise<void>;
    /** Best-effort hide of the app's windows (AppleScript; needs Automation). */
    hideApp(appName: string): Promise<void>;
    /**
     * Launch `binaryPath` with `DYLD_INSERT_LIBRARIES=dylibPath`. The returned promise
     * resolves when the launched process EXITS (so the caller can relaunch), and rejects
     * if it fails to spawn. If `signal` aborts, the spawned process is force-killed so the
     * caller never blocks on a wedged GUI app (e.g. one ignoring SIGTERM at shutdown).
     */
    spawnInjected(binaryPath: string, dylibPath: string, signal?: AbortSignal): Promise<void>;
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15_000;
const DEFAULT_RELAUNCH_BACKOFF_MS = 1_000;
const DEFAULT_HIDE_DELAY_MS = 5_000;

/** The real macOS runner used in production. */
export class MacHelperProcessRunner implements HelperProcessRunner {
    resolveAppBinary(appName: string): string | null {
        for (const base of ["/System/Applications", "/Applications"]) {
            const p = `${base}/${appName}.app/Contents/MacOS/${appName}`;
            if (fs.existsSync(p)) return p;
        }
        return null;
    }

    async killApp(appName: string): Promise<void> {
        // killall exits non-zero with "No matching processes" when it isn't running — fine.
        await this.#run("killall", [appName]).catch(() => undefined);
    }

    async hideApp(appName: string): Promise<void> {
        const script = `tell application "System Events" to set visible of (every process whose name is "${appName}") to false`;
        await this.#run("osascript", ["-e", script]).catch(() => undefined);
    }

    spawnInjected(binaryPath: string, dylibPath: string, signal?: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Scrub the daemon's BBD_* vars (password, the local-auth bypass token, the PA
            // secret) from the injected app's environment — the dylib discovers the socket +
            // secret via the 0600 rendezvous file, never env, so it needs none of them.
            const env: NodeJS.ProcessEnv = {};
            for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("BBD_")) env[k] = v;
            env.DYLD_INSERT_LIBRARIES = dylibPath;

            const child = spawn(binaryPath, [], { env, stdio: "ignore", detached: false });
            const onAbort = (): void => {
                try {
                    child.kill("SIGKILL");
                } catch {
                    /* already gone */
                }
            };
            if (signal) {
                if (signal.aborted) onAbort();
                else signal.addEventListener("abort", onAbort, { once: true });
            }
            child.once("error", e => {
                signal?.removeEventListener("abort", onAbort);
                reject(e);
            });
            child.once("exit", () => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            });
        });
    }

    #run(cmd: string, args: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const c = spawn(cmd, args, { stdio: "ignore" });
            c.once("error", reject);
            c.once("exit", code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
        });
    }
}

export interface HelperInjectorDeps {
    targets: InjectableTarget[];
    runner: HelperProcessRunner;
    logger: Logger;
    /** Pause between kill and relaunch (overridable for tests). Default 1000ms. */
    backoffMs?: number;
    /** Delay before hiding the app window (overridable for tests). Default 5000ms. */
    hideDelayMs?: number;
}

export class HelperInjector {
    readonly #targets: InjectableTarget[];
    readonly #runner: HelperProcessRunner;
    readonly #logger: Logger;
    readonly #backoffMs: number;
    readonly #hideDelayMs: number;

    #stopping = false;
    /** appName -> the running inject loop (so we never double-start one). */
    readonly #loops = new Map<string, Promise<void>>();
    /** Aborted on stop() to force-kill any in-flight spawned app so the loops unblock. */
    readonly #abort = new AbortController();

    constructor(deps: HelperInjectorDeps) {
        this.#targets = deps.targets;
        this.#runner = deps.runner;
        this.#logger = deps.logger.child({ component: "HelperInjector" });
        this.#backoffMs = deps.backoffMs ?? DEFAULT_RELAUNCH_BACKOFF_MS;
        this.#hideDelayMs = deps.hideDelayMs ?? DEFAULT_HIDE_DELAY_MS;
    }

    /** Start (non-blocking) the inject loop for every currently-enabled target. */
    async start(): Promise<void> {
        this.#stopping = false;
        if (this.#targets.length === 0) {
            this.#logger.info("no injectable targets (resources dir unset?) — helper injection disabled");
            return;
        }
        for (const t of this.#targets) this.#ensureLoop(t);
    }

    /** React to a config toggle: spin up newly-enabled loops, kill newly-disabled apps. */
    async refresh(): Promise<void> {
        if (this.#stopping) return;
        for (const t of this.#targets) {
            if (t.isEnabled()) {
                this.#ensureLoop(t);
            } else if (this.#loops.has(t.appName)) {
                // The running loop re-checks isEnabled() after the app exits, so killing it
                // makes the loop observe "disabled" and stop relaunching.
                this.#logger.info(`${t.appName} private API disabled — stopping helper`);
                await this.#runner.killApp(t.appName);
            }
        }
    }

    /** UI "re-inject" button: kill + (re)start the loop for each enabled target. */
    async reinject(): Promise<{ injected: string[]; skipped: string[] }> {
        if (this.#stopping) return { injected: [], skipped: this.#targets.map(t => t.appName) };
        const injected: string[] = [];
        const skipped: string[] = [];
        for (const t of this.#targets) {
            if (!t.isEnabled()) {
                skipped.push(t.appName);
                continue;
            }
            await this.#runner.killApp(t.appName); // a live loop relaunches; otherwise we start one
            this.#ensureLoop(t);
            injected.push(t.appName);
        }
        this.#logger.info(`reinject requested — injected=[${injected.join(", ")}] skipped=[${skipped.join(", ")}]`);
        return { injected, skipped };
    }

    async stop(): Promise<void> {
        this.#stopping = true;
        // Force-kill any in-flight spawned app first so a loop blocked on `await exited`
        // unblocks even if `killall` (SIGTERM) doesn't make a wedged GUI app quit.
        this.#abort.abort();
        for (const t of this.#targets) await this.#runner.killApp(t.appName).catch(() => undefined);
        // Backstop: never let a stuck app block the daemon's ordered shutdown.
        await Promise.race([Promise.allSettled([...this.#loops.values()]), delay(5_000)]);
        this.#loops.clear();
    }

    #ensureLoop(t: InjectableTarget): void {
        if (this.#stopping || this.#loops.has(t.appName) || !t.isEnabled()) return;
        const loop = this.#runLoop(t).finally(() => this.#loops.delete(t.appName));
        this.#loops.set(t.appName, loop);
    }

    async #runLoop(t: InjectableTarget): Promise<void> {
        const binary = this.#runner.resolveAppBinary(t.appName);
        if (!binary) {
            this.#logger.warn(`cannot locate ${t.appName}.app binary — skipping injection`);
            return;
        }
        if (!fs.existsSync(t.dylibPath)) {
            this.#logger.error(`missing helper dylib for ${t.appName}: ${t.dylibPath}`);
            return;
        }

        let failures = 0;
        let lastErrorAt = 0;
        while (!this.#stopping && t.isEnabled() && failures < MAX_FAILURES) {
            try {
                await this.#runner.killApp(t.appName);
                await delay(this.#backoffMs);
                if (this.#stopping || !t.isEnabled()) break;

                this.#logger.info(`injecting ${t.appName} helper (DYLD_INSERT_LIBRARIES)`);
                const exited = this.#runner.spawnInjected(binary, t.dylibPath, this.#abort.signal);
                // Hide the window once it's up so the server box stays uncluttered.
                const hideTimer = setTimeout(() => void this.#runner.hideApp(t.appName), this.#hideDelayMs);
                try {
                    await exited;
                } finally {
                    clearTimeout(hideTimer); // also covers the spawn-reject path
                }

                // The app ran and exited on its own — that's a success, not a failure.
                failures = 0;
                if (this.#stopping || !t.isEnabled()) break;
                this.#logger.info(`${t.appName} exited — relaunching injected`);
            } catch (e) {
                if (this.#stopping || !t.isEnabled()) break;
                // A crash long after the last one resets the counter (steady-state restart,
                // not a tight crash loop).
                if (Date.now() - lastErrorAt > FAILURE_WINDOW_MS) failures = 0;
                failures += 1;
                lastErrorAt = Date.now();
                this.#logger.warn(`failed to inject ${t.appName} (${failures}/${MAX_FAILURES})`, e);
                await delay(this.#backoffMs);
            }
        }
        if (failures >= MAX_FAILURES) {
            this.#logger.error(`giving up injecting ${t.appName} after ${MAX_FAILURES} consecutive failures`);
        }
    }
}
