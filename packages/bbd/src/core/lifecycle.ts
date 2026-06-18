/**
 * Ordered startup/shutdown with rollback.
 *
 * The legacy server starts services as a linear `try/catch-and-continue` script:
 * a failure mid-startup is swallowed and the process keeps running half-
 * initialized, with null fields and no way to recover. The {@link Supervisor}
 * replaces that with explicit ordering and **rollback** — if service N fails to
 * start, services 1..N-1 are stopped in reverse order and startup returns an
 * `err`, so the daemon never lingers in a partially-constructed state.
 */

import { type Result, ok, err, toError } from "./result";
import type { Logger } from "./logger";

export interface HealthStatus {
    ok: boolean;
    detail?: string;
}

export interface Service {
    readonly name: string;
    start(): Promise<void> | void;
    stop?(): Promise<void> | void;
    health?(): Promise<HealthStatus> | HealthStatus;
}

export class Supervisor {
    readonly #services: readonly Service[];
    readonly #logger: Logger;
    readonly #started: Service[] = [];

    constructor(services: readonly Service[], logger: Logger) {
        this.#services = services;
        this.#logger = logger.child({ component: "Supervisor" });
    }

    /** Start every service in order. On any failure, roll back and return the error. */
    async start(): Promise<Result<void, Error>> {
        for (const service of this.#services) {
            try {
                this.#logger.info(`starting ${service.name}`);
                await service.start();
                this.#started.push(service);
            } catch (e) {
                const error = toError(e);
                this.#logger.error(`failed to start ${service.name}; rolling back`, error);
                await this.stop();
                return err(error);
            }
        }
        return ok(undefined);
    }

    /** Stop started services in reverse order, isolating per-service failures. */
    async stop(): Promise<void> {
        while (this.#started.length > 0) {
            const service = this.#started.pop()!;
            try {
                this.#logger.info(`stopping ${service.name}`);
                await service.stop?.();
            } catch (e) {
                // A failing stop must not prevent the rest from stopping.
                this.#logger.error(`error stopping ${service.name}`, toError(e));
            }
        }
    }

    /** Collect health from every running service that reports it. */
    async health(): Promise<Record<string, HealthStatus>> {
        const out: Record<string, HealthStatus> = {};
        for (const service of this.#started) {
            if (!service.health) continue;
            try {
                out[service.name] = await service.health();
            } catch (e) {
                out[service.name] = { ok: false, detail: toError(e).message };
            }
        }
        return out;
    }
}
