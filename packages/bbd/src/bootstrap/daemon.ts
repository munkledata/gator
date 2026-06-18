import { composeCore } from "../compose";
import { Supervisor, type Service } from "../core/lifecycle";
import { isErr } from "../core/result";
import type { Logger } from "../core/logger";
import type { HostPlatform } from "../host-platform/electron-adapter";
import { LoggerToken, HostPlatformToken } from "../tokens";

export interface DaemonOptions {
    /** The ordered services the daemon supervises (HTTP, socket, transport, listener, …). */
    services: readonly Service[];
    /** Defaults to HeadlessHostPlatform via composeCore — i.e. no Electron. */
    hostPlatform?: HostPlatform;
    logger?: Logger;
    injectionViable?: boolean;
}

/**
 * The headless daemon — the payoff of the Phase 0 Electron boundary.
 *
 * It composes the core (a `HeadlessHostPlatform` by default, no `electron` import
 * anywhere), supervises the services with ordered start + rollback, and wires
 * graceful shutdown through the host platform's `onBeforeQuit` (which the headless
 * impl backs with SIGTERM/SIGINT). Swapping in an Electron-backed HostPlatform —
 * the only difference during migration — changes nothing here.
 */
export class Daemon {
    readonly #supervisor: Supervisor;
    readonly #host: HostPlatform;
    readonly #logger: Logger;

    constructor(options: DaemonOptions) {
        const container = composeCore({
            hostPlatform: options.hostPlatform,
            logger: options.logger,
            injectionViable: options.injectionViable ?? false
        });
        this.#logger = container.resolve(LoggerToken).child({ component: "Daemon" });
        this.#host = container.resolve(HostPlatformToken);
        this.#supervisor = new Supervisor(options.services, this.#logger);
    }

    /** Start every service in order; on failure, rolls back and throws. */
    async start(): Promise<void> {
        const result = await this.#supervisor.start();
        if (isErr(result)) throw result.error;
        this.#host.onBeforeQuit(() => this.stop());
        this.#logger.info(`daemon started (host: ${this.#host.kind})`);
    }

    async stop(): Promise<void> {
        this.#logger.info("daemon stopping");
        await this.#supervisor.stop();
    }

    async health(): Promise<Record<string, { ok: boolean; detail?: string }>> {
        return this.#supervisor.health();
    }
}
