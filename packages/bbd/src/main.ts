import path from "node:path";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import { Server as SocketServer } from "socket.io";

import { Daemon } from "./bootstrap/daemon";
import { HeadlessHostPlatform } from "./host-platform/electron-adapter";
import { createConsoleLogger } from "./core/logger";
import { DrizzleConfigStore } from "./data/config-db/DrizzleConfigStore";
import { ConfigService } from "./config/ConfigService";
import { EventBus } from "./core/bus";
import os from "node:os";
import { OperationRegistry } from "./api/registry";
import { buildCoreOperations } from "./api/operations/coreOperations";
import { buildAdminOperations } from "./api/operations/adminOperations";
import { buildReadOperations } from "./api/operations/readOperations";
import { mountFastify } from "./api/fastifyAdapter";
import { mountSocket } from "./api/socketAdapter";
import { openReadOnlyChatDb } from "./data/imessage/connection";
import { introspectSchema } from "./data/imessage/schema";
import { ChatReader } from "./data/imessage/ChatReader";
import { HandleReader } from "./data/imessage/HandleReader";
import { AttachmentReader } from "./data/imessage/AttachmentReader";
import { AttachmentStreamer } from "./data/imessage/AttachmentStreamer";
import { mountAttachmentRoutes } from "./api/attachmentRoutes";
import { FramedUdsTransport } from "./private-api/PrivateApiTransport";
import { AppleScriptFallback } from "./messaging/appleScriptFallback";
import { OsascriptRunner } from "./messaging/OsascriptRunner";
import { MessageSender } from "./messaging/MessageSender";
import { buildActionOperations } from "./api/operations/actionOperations";
import { ContactsService } from "./contacts/ContactsService";
import { MacContactsSource } from "./contacts/MacContactsSource";
import { buildContactsOperations } from "./api/operations/contactsOperations";
import { FaceTimeService } from "./facetime/FaceTimeService";
import { FindMyService } from "./findmy/FindMyService";
import { FindMyDevicesReader } from "./findmy/FindMyDevicesReader";
import { buildFaceTimeOperations } from "./api/operations/facetimeOperations";
import { buildFindMyOperations } from "./api/operations/findmyOperations";
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

    // Read-only chat.db readers (Phase 3) feeding the migrated read operations.
    const chatDb = openReadOnlyChatDb(path.join(os.homedir(), "Library", "Messages", "chat.db"));
    const schema = introspectSchema(chatDb);
    const chatReader = new ChatReader(chatDb, schema);
    const handleReader = new HandleReader(chatDb, schema.handle);
    const attachmentReader = new AttachmentReader(chatDb, schema.attachment);
    const attachmentStreamer = new AttachmentStreamer(chatDb);

    // Write path (Phase 5): the hardened private-API transport + the send service.
    const transport = new FramedUdsTransport({
        socketPath: path.join(host.userDataPath(), "private-api.sock"),
        secret: randomBytes(24).toString("hex"),
        logger
    });
    const sender = new MessageSender(transport, new AppleScriptFallback(new OsascriptRunner(), logger), logger);

    const registry = new OperationRegistry()
        .registerAll(buildCoreOperations({ configStore, version: VERSION }))
        .registerAll(buildAdminOperations({ configService, version: VERSION, startedAt: Date.now() }))
        .registerAll(buildReadOperations({ chatReader, handleReader, attachmentReader }))
        .registerAll(buildActionOperations({ sender }))
        .registerAll(buildContactsOperations({ contacts: new ContactsService(new MacContactsSource(), logger) }))
        .registerAll(buildFaceTimeOperations({ facetime: new FaceTimeService(transport, logger) }))
        .registerAll(
            buildFindMyOperations({ findmy: new FindMyService(transport, logger), devices: new FindMyDevicesReader() })
        );

    const app = Fastify();
    let io: SocketServer | null = null;

    const httpService: Service = {
        name: "http",
        async start() {
            mountFastify(app, registry, { logger, auth });
            mountAttachmentRoutes(app, { streamer: attachmentStreamer, auth });
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

    const transportService: Service = {
        name: "private-api",
        start: () => transport.start(),
        stop: () => transport.stop()
    };

    const daemon = new Daemon({ services: [transportService, httpService], hostPlatform: host, logger });
    await daemon.start();
}

main().catch(err => {
    console.error("bbd failed to start:", err);
    process.exit(1);
});
