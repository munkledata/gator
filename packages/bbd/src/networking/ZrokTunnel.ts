import fs from "node:fs";
import { spawn as nodeSpawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Logger } from "../core/logger";

const execFileAsync = promisify(execFile);

export interface ZrokSettings {
    /** True when the user has selected zrok as the tunnel provider. */
    enabled: boolean;
    /** The zrok account token (from `zrok enable`). */
    token: string;
    /** Optional reserved share name for a stable URL. */
    reservedName?: string;
    /** What the tunnel proxies to, e.g. "127.0.0.1:1234". */
    backendTarget: string;
}

/** Minimal child-process surface, so tests can inject a fake spawn. */
export interface ChildHandle {
    stdout: { on(ev: "data", cb: (chunk: unknown) => void): void } | null;
    stderr: { on(ev: "data", cb: (chunk: unknown) => void): void } | null;
    on(ev: "exit" | "error", cb: (arg: unknown) => void): void;
    kill(signal?: string): void;
}
export type SpawnLike = (cmd: string, args: string[]) => ChildHandle;
export type EnableLike = (binPath: string, token: string) => Promise<void>;

export interface ZrokTunnelDeps {
    /** Path to the zrok binary (bundled in the app, passed by the shell). */
    binPath: string;
    /** Live settings accessor (read from config each start). */
    settings: () => ZrokSettings;
    /** Persist the acquired public URL as the server address. */
    onUrl: (url: string) => void | Promise<void>;
    logger: Logger;
    /** Injectable for tests; defaults to child_process.spawn. */
    spawn?: SpawnLike;
    /** Injectable for tests; defaults to running `zrok enable <token>`. */
    enableEnv?: EnableLike;
}

const PUBLIC_URL = /https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/;

/**
 * Runs the zrok tunnel for real (audit: zrok was advertised "Recommended" in the UI but
 * the daemon only stored the token and never created a tunnel). On start it enrolls the
 * environment with the token, spawns `zrok share` against the local API, scrapes the
 * public https URL from zrok's output, and persists it as the server address. The child
 * is the tunnel — it is killed on stop.
 */
export class ZrokTunnel {
    readonly #deps: ZrokTunnelDeps;
    readonly #spawn: SpawnLike;
    readonly #enableEnv: EnableLike;
    #child: ChildHandle | null = null;
    #url: string | null = null;

    constructor(deps: ZrokTunnelDeps) {
        this.#deps = deps;
        this.#spawn = deps.spawn ?? ((cmd, args) => nodeSpawn(cmd, args) as unknown as ChildHandle);
        this.#enableEnv =
            deps.enableEnv ??
            (async (binPath, token) => {
                await execFileAsync(binPath, ["enable", token]);
            });
    }

    isRunning(): boolean {
        return this.#child != null;
    }

    currentUrl(): string | null {
        return this.#url;
    }

    /** Whether the zrok binary is present (the feature is unavailable without it). */
    isAvailable(): boolean {
        return this.#deps.binPath === "zrok" || fs.existsSync(this.#deps.binPath);
    }

    async start(): Promise<void> {
        const s = this.#deps.settings();
        if (!s.enabled || !s.token) return;
        if (this.#child) return; // already running
        if (!this.isAvailable()) {
            this.#deps.logger.warn(`zrok binary not found at ${this.#deps.binPath}; cannot start tunnel`);
            return;
        }

        // Enrol the environment with the token (idempotent — ignore "already enabled").
        try {
            await this.#enableEnv(this.#deps.binPath, s.token);
        } catch (e) {
            this.#deps.logger.debug(`zrok enable returned an error (often already-enabled): ${(e as Error)?.message ?? e}`);
        }

        const args = s.reservedName
            ? ["share", "reserved", s.reservedName, "--headless"]
            : ["share", "public", s.backendTarget, "--headless"];
        this.#deps.logger.info(`starting zrok tunnel: ${args.join(" ")}`);
        const child = this.#spawn(this.#deps.binPath, args);
        this.#child = child;

        const onData = (chunk: unknown): void => {
            const m = String(chunk).match(PUBLIC_URL);
            if (m && m[0] !== this.#url) {
                this.#url = m[0];
                this.#deps.logger.info(`zrok public URL: ${this.#url}`);
                void this.#deps.onUrl(this.#url);
            }
        };
        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        child.on("error", err => this.#deps.logger.warn(`zrok process error: ${(err as Error)?.message ?? err}`));
        child.on("exit", code => {
            this.#deps.logger.warn(`zrok tunnel exited (code ${String(code)})`);
            this.#child = null;
            this.#url = null;
        });
    }

    async stop(): Promise<void> {
        this.#child?.kill("SIGTERM");
        this.#child = null;
        this.#url = null;
    }
}
