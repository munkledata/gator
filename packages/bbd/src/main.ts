import path from "node:path";
import Fastify from "fastify";
import { Server as SocketServer } from "socket.io";

import { Daemon } from "./bootstrap/daemon";
import { HeadlessHostPlatform } from "./host-platform/electron-adapter";
import { createConsoleLogger } from "./core/logger";
import { DrizzleConfigStore } from "./data/config-db/DrizzleConfigStore";
import { ConfigService } from "./config/ConfigService";
import { EventBus } from "./core/bus";
import { OperationRegistry } from "./api/registry";
import { buildCoreOperations } from "./api/operations/coreOperations";
import { buildAdminOperations } from "./api/operations/adminOperations";
import { mountFastify } from "./api/fastifyAdapter";
import { mountSocket } from "./api/socketAdapter";
import type { Service } from "./core/lifecycle";

const VERSION = "2.0.0-bbd";

/**
 * The headless daemon entrypoint — no Electron, no god-object. It composes the
 * config store, the unified operation registry (core + admin), and a combined
 * Fastify + Socket.IO server (the socket attaches to Fastify's HTTP server, with
 * allowEIO3 for legacy clients), then hands them to the {@link Daemon} which
 * supervises start/stop and wires graceful shutdown through the host platform.
 *
 * This binds a port and opens the config DB, so it is exercised by the build +
 * runtime, not the unit tests; the typechecker confirms the wiring is sound.
 */
async function main(): Promise<void> {
    const logger = createConsoleLogger("bbd");
    const host = new HeadlessHostPlatform();

    const configStore = new DrizzleConfigStore(path.join(host.userDataPath(), "config.db"));
    const configService = new ConfigService(configStore, new EventBus(), logger);
    const config = configStore.getConfig();
    const auth = { password: config.password };

    const registry = new OperationRegistry()
        .registerAll(buildCoreOperations({ configStore, version: VERSION }))
        .registerAll(buildAdminOperations({ configService, version: VERSION, startedAt: Date.now() }));

    const app = Fastify();
    let io: SocketServer | null = null;

    const httpService: Service = {
        name: "http",
        async start() {
            mountFastify(app, registry, { logger, auth });
            await app.listen({ port: config.socketPort, host: "0.0.0.0" });
            io = new SocketServer(app.server, { allowEIO3: true });
            mountSocket(io, registry, { logger, auth });
            logger.info(`API listening on :${config.socketPort}`);
        },
        async stop() {
            io?.close();
            await app.close();
        }
    };

    const daemon = new Daemon({ services: [httpService], hostPlatform: host, logger });
    await daemon.start();
}

main().catch(err => {
    console.error("bbd failed to start:", err);
    process.exit(1);
});
