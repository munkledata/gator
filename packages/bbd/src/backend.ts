import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import { Server as SocketServer } from "socket.io";

import { Daemon } from "./bootstrap/daemon";
import { HeadlessHostPlatform } from "./host-platform/electron-adapter";
import { createConsoleLogger, type Logger } from "./core/logger";
import { DrizzleConfigStore } from "./data/config-db/DrizzleConfigStore";
import { ConfigService } from "./config/ConfigService";
import { EventBus } from "./core/bus";
import { OperationRegistry } from "./api/registry";
import { buildCoreOperations } from "./api/operations/coreOperations";
import { buildAdminOperations } from "./api/operations/adminOperations";
import { buildReadOperations } from "./api/operations/readOperations";
import { mountFastify } from "./api/fastifyAdapter";
import { mountSocket } from "./api/socketAdapter";
import { serveStaticUi } from "./api/staticUi";
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
import { DrizzleScheduledMessageStore } from "./scheduled/DrizzleScheduledMessageStore";
import { Scheduler } from "./scheduled/Scheduler";
import { buildScheduledOperations } from "./api/operations/scheduledOperations";
import type { DomainEvents } from "./events";
import { MessageReader } from "./data/imessage/MessageReader";
import { IMessageListener } from "./data/imessage/IMessageListener";
import { ChatDbWatcher } from "./data/imessage/watcher";
import { FileCursorStore } from "./data/imessage/FileCursorStore";
import { DrizzleWebhookStore } from "./webhooks/DrizzleWebhookStore";
import { WebhookSubscriber } from "./webhooks/WebhookSubscriber";
import { WebhookDispatcher } from "./networking/webhook";
import { buildWebhookOperations } from "./api/operations/webhookOperations";
import { wireMessageFanout } from "./serialize/messageFanout";
import type { Service } from "./core/lifecycle";

export const BBD_VERSION = "2.0.0-bbd";

export interface BackendOptions {
    /** Where the writable state lives (config.db, cursor.json, sockets). Defaults to the headless path. */
    userDataPath?: string;
    /** The Messages container directory; chat.db and its watcher live under here. */
    messagesDir?: string;
    /** Override the read-only chat.db path (defaults to <messagesDir>/chat.db). */
    chatDbPath?: string;
    /** Listen port (defaults to the stored config's socketPort). */
    port?: number;
    /** Auth password (defaults to the stored config's password). */
    password?: string;
    /** Private-API handshake secret (defaults to a fresh random secret each boot). */
    privateApiSecret?: string;
    /** Root logger (defaults to a console logger). */
    logger?: Logger;
    /** If set, the built UI bundle at this directory is served at `/` (SPA). */
    serveUiFrom?: string;
}

export interface RunningBackend {
    daemon: Daemon;
    port: number;
    stop(): Promise<void>;
}

/**
 * Boots the full bbd backend and returns a handle. This is the embeddable entry the
 * Electron shell forks (via {@link file://./daemon-entry.ts}) and the headless
 * {@link file://./main.ts} both call — everything is injectable so the Electron host
 * can supply `app.getPath("userData")` and serve the bundled UI, while headless runs
 * fall back to sensible defaults.
 */
export async function startBbdBackend(options: BackendOptions = {}): Promise<RunningBackend> {
    const logger = options.logger ?? createConsoleLogger("bbd");
    const host = new HeadlessHostPlatform();
    const userDataPath = options.userDataPath ?? host.userDataPath();
    const messagesDir = options.messagesDir ?? path.join(os.homedir(), "Library", "Messages");
    const chatDbPath = options.chatDbPath ?? path.join(messagesDir, "chat.db");

    const dbPath = path.join(userDataPath, "config.db");
    const configStore = new DrizzleConfigStore(dbPath);
    const configService = new ConfigService(configStore, new EventBus(), logger);
    const config = configStore.getConfig();
    const port = options.port ?? config.socketPort;
    const auth = { password: options.password ?? config.password };

    // Read-only chat.db readers (Phase 3) feeding the migrated read operations.
    const chatDb = openReadOnlyChatDb(chatDbPath);
    const schema = introspectSchema(chatDb);
    const chatReader = new ChatReader(chatDb, schema);
    const handleReader = new HandleReader(chatDb, schema.handle);
    const attachmentReader = new AttachmentReader(chatDb, schema.attachment);
    const attachmentStreamer = new AttachmentStreamer(chatDb);

    // Write path (Phase 5): the hardened private-API transport + the send service.
    const transport = new FramedUdsTransport({
        socketPath: path.join(userDataPath, "private-api.sock"),
        secret: options.privateApiSecret ?? randomBytes(24).toString("hex"),
        logger
    });
    const sender = new MessageSender(transport, new AppleScriptFallback(new OsascriptRunner(), logger), logger);

    const registry = new OperationRegistry()
        .registerAll(buildCoreOperations({ configStore, version: BBD_VERSION }))
        .registerAll(buildAdminOperations({ configService, version: BBD_VERSION, startedAt: Date.now() }))
        .registerAll(buildReadOperations({ chatReader, handleReader, attachmentReader }))
        .registerAll(buildActionOperations({ sender }))
        .registerAll(buildContactsOperations({ contacts: new ContactsService(new MacContactsSource(), logger) }))
        .registerAll(buildFaceTimeOperations({ facetime: new FaceTimeService(transport, logger) }))
        .registerAll(
            buildFindMyOperations({ findmy: new FindMyService(transport, logger), devices: new FindMyDevicesReader() })
        );

    // Scheduled messages (persisted in the config DB) + the scheduler service.
    const scheduledStore = new DrizzleScheduledMessageStore(dbPath);
    registry.registerAll(buildScheduledOperations({ store: scheduledStore }));
    const scheduler = new Scheduler(scheduledStore, sender, logger);

    // Webhooks + the live read -> serialize-once -> socket + webhook fanout.
    const domainBus = new EventBus<DomainEvents>();
    const webhookStore = new DrizzleWebhookStore(dbPath);
    const webhookSubscriber = new WebhookSubscriber(webhookStore, new WebhookDispatcher({ logger }), logger);
    registry.registerAll(buildWebhookOperations({ store: webhookStore }));

    const messageReader = new MessageReader(chatDb, schema.message);
    const cursorStore = new FileCursorStore(path.join(userDataPath, "cursor.json"));
    const listener = new IMessageListener(messageReader, cursorStore, domainBus, logger);
    const watcher = new ChatDbWatcher(messagesDir, () => void listener.poll());

    const app = Fastify();
    let io: SocketServer | null = null;

    wireMessageFanout(domainBus, {
        emit: (type, dto) => io?.emit(type, dto),
        webhook: (type, dto) => webhookSubscriber.onEvent(type, dto)
    });

    const httpService: Service = {
        name: "http",
        async start() {
            mountFastify(app, registry, { logger, auth });
            mountAttachmentRoutes(app, { streamer: attachmentStreamer, auth });
            // The Electron shell serves its bundled UI from the same origin as the API,
            // so the renderer's apiClient is same-origin and the headless extraction is free.
            if (options.serveUiFrom) serveStaticUi(app, options.serveUiFrom);
            await app.listen({ port, host: "0.0.0.0" });
            io = new SocketServer(app.server, { allowEIO3: true });
            mountSocket(io, registry, { logger, auth });
            logger.info(`API listening on :${port}`);
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

    const schedulerService: Service = {
        name: "scheduler",
        start: () => scheduler.start(),
        stop: () => scheduler.stop()
    };

    const readPathService: Service = {
        name: "read-path",
        start: async () => {
            await listener.init();
            watcher.start();
        },
        stop: () => watcher.stop()
    };

    const daemon = new Daemon({
        services: [transportService, httpService, schedulerService, readPathService],
        hostPlatform: host,
        logger
    });
    await daemon.start();

    return {
        daemon,
        port,
        stop: () => daemon.stop()
    };
}
