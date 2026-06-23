import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, X509Certificate } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { Server as SocketServer } from "socket.io";

import { Daemon } from "./bootstrap/daemon";
import { HeadlessHostPlatform } from "./host-platform/electron-adapter";
import { createConsoleLogger, type Logger } from "./core/logger";
import { DrizzleConfigStore } from "./data/config-db/DrizzleConfigStore";
import { VaultedConfigStore } from "./data/config-db/VaultedConfigStore";
import { MacKeychainSecretStore } from "./data/config-db/SecretStore";
import { ConfigService } from "./config/ConfigService";
import { EventBus } from "./core/bus";
import { OperationRegistry } from "./api/registry";
import { buildCoreOperations } from "./api/operations/coreOperations";
import { buildAdminOperations } from "./api/operations/adminOperations";
import { buildAdminCommandOperations } from "./api/operations/adminCommandOperations";
import { buildReadOperations } from "./api/operations/readOperations";
import { mountFastify } from "./api/fastifyAdapter";
import { mountSocket, AUTHED_ROOM } from "./api/socketAdapter";
import { RateLimiter } from "./api/auth";
import { serveStaticUi } from "./api/staticUi";
import { openChatDbOrEmpty } from "./data/imessage/connection";
import { introspectSchema } from "./data/imessage/schema";
import { ChatReader } from "./data/imessage/ChatReader";
import { StatsReader } from "./data/imessage/StatsReader";
import { MacPermissions } from "./host-platform/MacPermissions";
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
import { WebhookDispatcher, isPublicHttpUrl } from "./networking/webhook";
import { CloudflareDdns } from "./networking/CloudflareDdns";
import { CertificateService, hostFromServerAddress } from "./networking/CertificateService";
import { AcmeService } from "./networking/AcmeService";
import { LETS_ENCRYPT_PRODUCTION, LETS_ENCRYPT_STAGING } from "./networking/acme/AcmeClient";
import { ZrokTunnel } from "./networking/ZrokTunnel";
import { buildWebhookOperations } from "./api/operations/webhookOperations";
import { wireMessageFanout } from "./serialize/messageFanout";
import { buildNotificationRegistry } from "./notifications/buildNotificationRegistry";
import { createWebPushTransport } from "./notifications/webpush/WebPushSender";
import { parseServiceAccount } from "./notifications/fcm/serviceAccount";
import { FirebaseSetupService } from "./notifications/fcm/FirebaseSetupService";
import { mountFirebaseSetupRoutes } from "./api/firebaseSetupRoutes";
import type { OAuthFetch } from "./notifications/fcm/googleOAuth";
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
    /**
     * Per-boot secret that marks the local admin UI as trusted. The Electron shell
     * generates it, passes it here, and injects it into its own renderer; presented as
     * the `x-bbd-local-auth` header, it grants password-free access — never the source
     * IP (audit S1). Undefined in headless runs (everything uses the password).
     */
    localAuthToken?: string;
    /**
     * Bind the plain-HTTP listener to all interfaces (`0.0.0.0`) instead of loopback.
     * Default is `127.0.0.1` (audit S4): plain HTTP must not be reachable off-host —
     * remote clients use the TLS listener or an external reverse proxy. Opt in only for
     * a trusted LAN with no untrusted hosts.
     */
    bindAll?: boolean;
    /** Private-API handshake secret (defaults to a fresh random secret each boot). */
    privateApiSecret?: string;
    /** Path to the bundled `zrok` binary (the shell passes the packaged location). */
    zrokBinPath?: string;
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
    const bootAt = Date.now();
    const logger = options.logger ?? createConsoleLogger("bbd");
    const host = new HeadlessHostPlatform();
    const userDataPath = options.userDataPath ?? host.userDataPath();
    const messagesDir = options.messagesDir ?? path.join(os.homedir(), "Library", "Messages");
    const chatDbPath = options.chatDbPath ?? path.join(messagesDir, "chat.db");

    const dbPath = path.join(userDataPath, "config.db");
    // Keep long-lived cloud credentials (FCM service-account key, OAuth secret, Cloudflare/zrok
    // tokens, VAPID key) in the macOS Keychain instead of the plaintext config.db (audit F18).
    // VaultedConfigStore migrates any existing plaintext secrets on first run, redacts them from
    // disk, and re-hydrates them in memory so every consumer reads them as before. On a host with
    // no usable keychain it degrades to the plaintext DrizzleConfigStore behavior.
    const configStore = await VaultedConfigStore.create(
        new DrizzleConfigStore(dbPath),
        new MacKeychainSecretStore(),
        logger
    );
    const configService = new ConfigService(configStore, new EventBus(), logger);
    const config = configStore.getConfig();
    const port = options.port ?? config.socketPort;
    // The actual listening port, resolved after listen() — lets callers pass port 0 for
    // an OS-assigned free port (tests) and reflects the real port back to the shell.
    let boundPort = port;
    const auth = {
        password: options.password ?? config.password,
        localToken: options.localAuthToken,
        // Brute-force lockout for the password path (audit S5): 10 failures / 60s per IP.
        rateLimiter: new RateLimiter()
    };
    // Plain HTTP binds to loopback unless explicitly opted into all-interfaces (audit S4).
    // The "LAN URL" connection mode is exactly that opt-in: the user has chosen direct,
    // password-authed LAN access (no tunnel/TLS), so we MUST bind 0.0.0.0 or the advertised
    // LAN address is unreachable. Driven by `proxy_service === 'lan-url'` (what the UI persists
    // when LAN URL is selected), in addition to the BBD_BIND_ALL env opt-in.
    const lanMode = String((config as Record<string, unknown>).proxy_service ?? "").toLowerCase() === "lan-url";
    const bindHost = options.bindAll || lanMode ? "0.0.0.0" : "127.0.0.1";
    if (lanMode && !options.bindAll) logger.info("LAN URL mode: binding plain HTTP to 0.0.0.0 for direct LAN access");

    // Read-only chat.db readers (Phase 3) feeding the migrated read operations.
    const { db: chatDb, degraded: readPathDegraded } = openChatDbOrEmpty(chatDbPath);
    if (readPathDegraded) {
        logger.warn(
            `chat.db unavailable at ${chatDbPath} — Full Disk Access not granted? Read path (chats/messages/stats) degraded to empty; restart after granting access.`
        );
    }
    const schema = introspectSchema(chatDb);
    const chatReader = new ChatReader(chatDb, schema);
    const handleReader = new HandleReader(chatDb, schema.handle);
    const attachmentReader = new AttachmentReader(chatDb, schema.attachment);
    const messageReader = new MessageReader(chatDb, schema.message);
    const attachmentStreamer = new AttachmentStreamer(chatDb);

    // Populate the server-info display fields the fork never set (so the UI showed blank):
    // the Mac's registered iMessage email (from chat.db) and a computer identifier (its
    // hostname). Best-effort + fire-and-forget so a detection failure never blocks boot.
    void (async () => {
        try {
            const detected_imessage = chatReader.detectOwnEmail() ?? "";
            const computer_id = os.hostname();
            await configService.update({ detected_imessage, computer_id } as Partial<typeof config>);
            logger.info(`server-info populated: computer_id=${computer_id}, iMessage email ${detected_imessage ? "detected" : "not found"}`);
        } catch (e) {
            logger.error("failed to populate server-info (iMessage email / computer id)", e);
        }
    })();

    // Write path (Phase 5): the hardened private-API transport + the send service.
    const transport = new FramedUdsTransport({
        socketPath: path.join(userDataPath, "private-api.sock"),
        secret: options.privateApiSecret ?? randomBytes(24).toString("hex"),
        logger
    });
    const sender = new MessageSender(transport, new AppleScriptFallback(new OsascriptRunner(), logger), logger);
    const contacts = new ContactsService(new MacContactsSource(), logger);
    // Two Socket.IO servers may be live: one on the loopback plain-HTTP listener (local
    // UI) and one on the public TLS listener. Declared early so the admin-command
    // dispatcher can emit() to clients once they exist.
    let plainIo: SocketServer | null = null;
    let tlsIo: SocketServer | null = null;
    // The tunnel's dedicated API-only Socket.IO (audit F17); a ref box so emitToAuthed (defined
    // here) can reach the instance the tunnel service creates later, and broadcast to
    // tunnel-connected clients too.
    const tunnelIoRef: { current: SocketServer | null } = { current: null };
    // Server-push only ever reaches authenticated sockets (audit S6): they join
    // AUTHED_ROOM at handshake, so an unauthenticated connection sees nothing.
    const emitToAuthed = (event: string, data: unknown): void => {
        plainIo?.to(AUTHED_ROOM).emit(event, data);
        tlsIo?.to(AUTHED_ROOM).emit(event, data);
        tunnelIoRef.current?.to(AUTHED_ROOM).emit(event, data);
    };

    const registry = new OperationRegistry()
        .registerAll(buildCoreOperations({ configStore, version: BBD_VERSION }))
        .registerAll(buildAdminOperations({ configService, version: BBD_VERSION, startedAt: Date.now() }))
        .registerAll(buildReadOperations({ chatReader, handleReader, attachmentReader, messageReader }))
        .registerAll(buildActionOperations({ sender }))
        .registerAll(buildContactsOperations({ contacts }))
        .registerAll(buildFaceTimeOperations({ facetime: new FaceTimeService(transport, logger) }))
        .registerAll(
            buildFindMyOperations({ findmy: new FindMyService(transport, logger), devices: new FindMyDevicesReader() })
        );

    // Scheduled messages (persisted in the config DB) + the scheduler service.
    const scheduledStore = new DrizzleScheduledMessageStore(dbPath);
    registry.registerAll(buildScheduledOperations({ store: scheduledStore }));
    const scheduler = new Scheduler(scheduledStore, sender, logger);

    // Webhooks + the live read -> serialize-once -> socket + webhook + push fanout.
    const domainBus = new EventBus<DomainEvents>();
    const webhookStore = new DrizzleWebhookStore(dbPath);
    // SSRF guard ON by default (audit S5): webhooks may only target public http(s) hosts.
    const webhookSubscriber = new WebhookSubscriber(
        webhookStore,
        new WebhookDispatcher({ logger, allow: isPublicHttpUrl }),
        logger
    );
    registry.registerAll(buildWebhookOperations({ store: webhookStore }));

    // Forward live Private-API helper events (typing indicators, read receipts,
    // group rename/participant changes, incoming FaceTime, etc.) to socket + webhook
    // clients. The transport always supported pushed events; the fork simply never
    // subscribed, so only chat.db-polled new/updated-message events reached clients
    // (audit: real-time event regression). new-message/updated-message still come from
    // the chat.db watcher below; these are the everything-else live events.
    transport.onEvent((event, data) => {
        emitToAuthed(event, data);
        // A webhook dispatch failure must not become an unhandled rejection (audit F19).
        webhookSubscriber.onEvent(event, data).catch(e => logger.error(`webhook onEvent(${event}) failed`, e));
    });

    // Push notifications. Both providers read their credentials live from the config
    // store, so configuring FCM (service account) or Web Push (VAPID keys) after boot
    // takes effect without a restart.
    const webPushTransport = createWebPushTransport({
        logger,
        // SSRF guard (audit F16): the subscription endpoint is fetched server-side, so refuse
        // any non-public host — same predicate the webhook dispatcher uses above.
        allow: isPublicHttpUrl,
        vapid: () => {
            const wp = configStore.getConfig().notifications.webpush;
            if (!wp.vapidPublicKey || !wp.vapidPrivateKey) return null;
            return {
                publicKey: wp.vapidPublicKey,
                privateKey: wp.vapidPrivateKey,
                subject: wp.vapidSubject || "mailto:webpush@gator.local"
            };
        }
    });
    const notifications = buildNotificationRegistry(config.notifications, logger, {
        fcmCredentials: () => parseServiceAccount(configStore.getConfig().notifications.fcm.serviceAccount ?? null),
        webpush: webPushTransport
    });

    // Automatic Firebase setup (Google OAuth -> provision project -> service account).
    // The redirect lands on the loopback /oauth/callback route mounted below.
    const firebaseSetup = new FirebaseSetupService({
        fetch: globalThis.fetch as unknown as OAuthFetch,
        redirectUri: `http://127.0.0.1:${port}/oauth/callback`,
        saveServiceAccount: async account => {
            const n = configStore.getConfig().notifications;
            await configService.update({ notifications: { ...n, fcm: { ...n.fcm, enabled: true, serviceAccount: account } } });
        },
        emit: state => emitToAuthed("firebase-setup-status", state),
        logger
    });

    // Cloudflare dynamic DNS — reads its (flat camelCase) settings from the live config each tick.
    const cloudflareDdns = new CloudflareDdns(() => {
        const c = configStore.getConfig() as Record<string, unknown>;
        return {
            enabled: Boolean(c.cloudflareDdnsEnabled),
            apiToken: String(c.cloudflareDdnsApiToken ?? ""),
            record: String(c.cloudflareDdnsRecord ?? ""),
            zone: String(c.cloudflareDdnsZone ?? ""),
            proxied: Boolean(c.cloudflareDdnsProxied),
            intervalSeconds: Number(c.cloudflareDdnsIntervalSeconds ?? 300)
        };
    }, { logger });

    // zrok tunnel — a real public-URL provider (replaces the dead config-only stub). It
    // proxies to the loopback API and writes the acquired https URL back as the server
    // address so clients can pair with it.
    const zrok = new ZrokTunnel({
        binPath: options.zrokBinPath ?? "zrok",
        settings: () => {
            const c = configStore.getConfig() as Record<string, unknown>;
            return {
                enabled: c.tunnelProvider === "zrok" || Boolean(c.enable_zrok),
                token: String(c.zrok_token ?? ""),
                reservedName: c.zrok_reserved_name ? String(c.zrok_reserved_name) : undefined,
                // Target the dedicated API-only listener (withUi:false), NOT the loopback admin
                // listener, so the tunnel never re-exposes the admin SPA or the /oauth/callback
                // route (audit F17). Falls back to the main port only if the tunnel listener
                // somehow failed to bind (degraded — still better than no tunnel).
                backendTarget: `127.0.0.1:${tunnelPort || boundPort}`
            };
        },
        onUrl: async url => {
            await configService.update({ serverAddress: url } as Record<string, unknown>);
            emitToAuthed("new-server", url);
        },
        logger
    });

    const certsDir = path.join(userDataPath, "certs");
    const certService = new CertificateService(certsDir, logger);
    let tlsApp: FastifyInstance | null = null;

    // Dedicated API-only listener for the zrok tunnel (audit F17). The tunnel must NOT proxy
    // the loopback `app` (which is mounted withUi:true → serves the admin SPA + the
    // unauthenticated /oauth/callback whose isLoopback guard is defeated by same-host tunnel
    // traffic). This instance is mounted withUi:false — JSON API only, no SPA, no callback —
    // and bound to loopback on an OS-assigned port; zrok targets THIS port instead.
    let tunnelApp: FastifyInstance | null = null;
    let tunnelPort = 0;

    // Let's Encrypt (dns-01 via Cloudflare). Reuses the Cloudflare DDNS token + zone; the
    // cert domain defaults to the configured serverAddress host. onCert hot-reloads the
    // running HTTPS listener on renewal (no restart) via the TLS socket's secure context.
    const acme = new AcmeService({
        certsDir,
        cert: certService,
        logger,
        settings: () => {
            const c = configStore.getConfig() as Record<string, unknown>;
            return {
                enabled: c.tlsMode === "letsencrypt",
                email: String(c.acmeEmail ?? ""),
                domain: String(c.tlsDomain ?? "") || hostFromServerAddress(c.serverAddress) || "",
                directoryUrl: c.acmeStaging ? LETS_ENCRYPT_STAGING : LETS_ENCRYPT_PRODUCTION,
                cloudflareToken: String(c.cloudflareDdnsApiToken ?? ""),
                cloudflareZone:
                    String(c.cloudflareDdnsZone ?? "") ||
                    (hostFromServerAddress(c.serverAddress)?.split(".").slice(-2).join(".") ?? "")
            };
        },
        onCert: material => {
            try {
                (tlsApp?.server as { setSecureContext?: (o: { key: string; cert: string }) => void } | undefined)?.setSecureContext?.(
                    { key: material.key, cert: material.cert }
                );
                logger.info("hot-reloaded the TLS listener with the renewed certificate");
            } catch (e) {
                logger.warn(`could not hot-reload TLS cert (a restart will pick it up): ${(e as Error)?.message ?? e}`);
            }
        }
    });

    // Describe the certificate the HTTPS listener is (or would be) serving, parsed from
    // the actual cert on disk — domain, expiry, issuer — for the UI's TLS status panel.
    const tlsInfo = (): Record<string, unknown> => {
        const c = configStore.getConfig() as Record<string, unknown>;
        const mode = String(c.tlsMode ?? "self-signed");
        const configuredDomain = String(c.tlsDomain ?? "") || hostFromServerAddress(c.serverAddress) || null;
        const certPath =
            mode === "letsencrypt"
                ? path.join(certsDir, "le-cert.pem")
                : mode === "custom"
                  ? String(c.tlsCertPath ?? "") || null
                  : path.join(certsDir, "cert.pem");

        let certExpiry: string | null = null;
        let issuer: string | null = null;
        let subjectAltName: string | null = null;
        let domain = configuredDomain;
        try {
            if (certPath && fs.existsSync(certPath)) {
                const x = new X509Certificate(fs.readFileSync(certPath));
                certExpiry = new Date(x.validTo).toISOString();
                const cn = /CN=([^\n,/]+)/.exec(x.issuer ?? "")?.[1] ?? null;
                issuer = cn ?? (x.issuer ? x.issuer.split("\n")[0]! : null);
                subjectAltName = x.subjectAltName ?? null;
                const subjectCn = /CN=([^\n,/]+)/.exec(x.subject ?? "")?.[1];
                if (subjectCn) domain = subjectCn;
            }
        } catch {
            /* unparseable cert — leave fields null */
        }
        return {
            enabled: Boolean(c.tlsEnabled),
            port: Number(c.tlsPort ?? 1235),
            mode,
            domain,
            customCert: Boolean(c.tlsCertPath && c.tlsKeyPath),
            hasCert: certExpiry != null,
            certExpiry,
            issuer,
            subjectAltName
        };
    };

    // The admin-command dispatcher — the UI's former-IPC channels over HTTP.
    registry.registerAll(
        buildAdminCommandOperations({
            configService,
            configStore,
            cloudflareDdns,
            zrok,
            acme,
            tlsInfo,
            firebaseSetup,
            chatReader,
            contacts,
            scheduledStore,
            webhookStore,
            transport,
            stats: new StatsReader(chatDb),
            permissions: new MacPermissions(),
            version: BBD_VERSION,
            emit: (event, data) => emitToAuthed(event, data),
            logger
        })
    );

    const cursorStore = new FileCursorStore(path.join(userDataPath, "cursor.json"));
    const listener = new IMessageListener(messageReader, cursorStore, domainBus, logger);
    // A poll failure (transient SQLITE_BUSY/IOERR on chat.db) must not become an unhandled
    // rejection that crashes the daemon (audit F19) — log and let the next watcher tick retry.
    const watcher = new ChatDbWatcher(messagesDir, () => {
        listener.poll().catch(e => logger.error("chat.db poll failed (will retry on next change)", e));
    });

    const app = Fastify();

    wireMessageFanout(domainBus, {
        emit: (type, dto) => emitToAuthed(type, dto),
        webhook: (type, dto) => webhookSubscriber.onEvent(type, dto),
        logger,
        // Resolve the live message's chat association + sender handle from the raw row so the
        // emitted DTO carries chats[]/handle like the sync (query-messages) path does (audit
        // F1). The raw readSince row only has message-table columns, so batch-hydrate by ROWID
        // (chats) and handle_id (sender). One message per event → single-element batches.
        hydrate: row => {
            const rowId = Number(row["ROWID"]);
            const chats = Number.isFinite(rowId) ? chatReader.getChatsForMessages([rowId]).get(rowId) ?? [] : [];
            const handleId = Number(row["handle_id"]);
            const handle =
                Number.isFinite(handleId) && handleId > 0
                    ? handleReader.getHandlesByRowIds([handleId]).get(handleId) ?? null
                    : null;
            return { chats, handle };
        },
        // Only fresh inserts get a push; updates (edits/reactions hitting existing rows)
        // ride the socket/webhook sinks but shouldn't re-alert the device.
        notify: async (type, dto) => {
            if (type !== "new-message") return;
            const devices = await configStore.listDevices();
            if (devices.length === 0) return;
            await notifications.dispatch(devices, { type, data: dto, priority: "high" });
        }
    });

    // Mounts the API + attachment + firebase + health routes on a Fastify instance.
    // `withUi` controls whether the bundled admin SPA is served from this listener — we
    // serve it only on the loopback listener so the admin UI isn't exposed on the public
    // TLS endpoint (native clients use the API directly).
    const mountApiRoutes = (target: FastifyInstance, withUi: boolean): void => {
        mountFastify(target, registry, { logger, auth });
        mountAttachmentRoutes(target, { streamer: attachmentStreamer, auth });
        // The OAuth callback + the static admin SPA are LOCAL-UI-ONLY surfaces (audit F17):
        // Google only ever redirects to the loopback 127.0.0.1 callback, and the admin SPA must
        // never be reachable through a public tunnel/TLS endpoint. Gating both on `withUi`
        // means the tunnel/TLS API instances (mounted withUi:false) expose ONLY the
        // password/local-token-guarded JSON API — not the unauthenticated callback (whose
        // isLoopback(request.ip) guard is meaningless for same-host tunnel traffic) nor the SPA.
        if (withUi) mountFirebaseSetupRoutes(target, firebaseSetup);
        // Unauthenticated liveness/readiness probe for the shell/launchd watchdog.
        // Leaks only liveness + whether the chat.db read path is degraded — no secrets.
        target.get("/api/v1/health", async () => ({
            ok: true,
            degraded: readPathDegraded,
            uptimeMs: Date.now() - bootAt
        }));
        if (withUi && options.serveUiFrom) serveStaticUi(target, options.serveUiFrom);
    };

    const httpService: Service = {
        name: "http",
        async start() {
            mountApiRoutes(app, true);
            await app.listen({ port, host: bindHost });
            const addr = app.server.address();
            if (addr && typeof addr === "object") boundPort = addr.port;
            plainIo = new SocketServer(app.server, { allowEIO3: true });
            mountSocket(plainIo, registry, { logger, auth });
            logger.info(`API listening on ${bindHost}:${boundPort}`);
        },
        async stop() {
            plainIo?.close();
            await app.close();
        }
    };

    // Optional built-in TLS listener for remote clients (audit S4 / restored self-signed
    // HTTPS capability). Binds 0.0.0.0 with a self-signed (or user-supplied) cert so the
    // daemon can terminate TLS itself instead of requiring an external reverse proxy.
    const tlsService: Service = {
        name: "tls",
        async start() {
            const c = configStore.getConfig();
            if (!c.tlsEnabled) return;
            const host = hostFromServerAddress(c.serverAddress);

            // Acquire the cert for the configured mode, but NEVER let a TLS misconfig
            // (e.g. Let's Encrypt selected before an email/domain is saved) crash the whole
            // daemon: on failure, fall back to a self-signed cert so HTTPS still comes up;
            // if even that fails, skip the HTTPS listener and keep serving over loopback.
            let material;
            try {
                if (c.tlsMode === "custom" || (c.tlsCertPath && c.tlsKeyPath)) {
                    material = certService.loadFrom(c.tlsCertPath, c.tlsKeyPath);
                } else if (c.tlsMode === "letsencrypt") {
                    // Issue (or load a still-valid) Let's Encrypt cert, then keep it renewed.
                    material = await acme.ensure();
                    acme.startRenewal();
                } else {
                    material = await certService.ensureSelfSigned("Gator", host ? [host] : []);
                }
            } catch (e) {
                logger.warn(
                    `TLS '${c.tlsMode}' setup failed (${(e as Error)?.message ?? e}); falling back to a self-signed certificate`
                );
                try {
                    material = await certService.ensureSelfSigned("Gator", host ? [host] : []);
                } catch (e2) {
                    logger.error(
                        `self-signed TLS fallback also failed (${(e2 as Error)?.message ?? e2}); HTTPS listener disabled`
                    );
                    return;
                }
            }

            tlsApp = Fastify({ https: { key: material.key, cert: material.cert } });
            mountApiRoutes(tlsApp, false);
            await tlsApp.listen({ port: c.tlsPort, host: "0.0.0.0" });
            tlsIo = new SocketServer(tlsApp.server, { allowEIO3: true });
            mountSocket(tlsIo, registry, { logger, auth });
            logger.info(`TLS API (${c.tlsMode}) listening on 0.0.0.0:${c.tlsPort}`);
        },
        async stop() {
            acme.stop();
            tlsIo?.close();
            await tlsApp?.close();
        }
    };

    // Dedicated API-only listener the zrok tunnel proxies to (audit F17). Loopback-bound on an
    // OS-assigned port, mounted withUi:false — no admin SPA, no /oauth/callback — so a public
    // tunnel can never reach those local-only surfaces. Started before zrok so its port is set
    // when zrok reads its settings. Cheap (one extra loopback listener); kept always-on so
    // enabling the tunnel at runtime needs no restart.
    const tunnelService: Service = {
        name: "tunnel-api",
        async start() {
            tunnelApp = Fastify();
            mountApiRoutes(tunnelApp, false);
            await tunnelApp.listen({ port: 0, host: "127.0.0.1" });
            const addr = tunnelApp.server.address();
            if (addr && typeof addr === "object") tunnelPort = addr.port;
            const io = new SocketServer(tunnelApp.server, { allowEIO3: true });
            mountSocket(io, registry, { logger, auth });
            tunnelIoRef.current = io;
            logger.info(`tunnel API (no UI) listening on 127.0.0.1:${tunnelPort}`);
        },
        async stop() {
            tunnelIoRef.current?.close();
            tunnelIoRef.current = null;
            await tunnelApp?.close();
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

    const ddnsService: Service = {
        name: "cloudflare-ddns",
        start: () => cloudflareDdns.start(),
        stop: () => cloudflareDdns.stop()
    };

    const zrokService: Service = {
        name: "zrok",
        start: () => zrok.start(),
        stop: () => zrok.stop()
    };

    const readPathService: Service = {
        name: "read-path",
        start: async () => {
            // Nothing to read/watch without chat.db; the daemon still serves everything else.
            if (readPathDegraded) return;
            await listener.init();
            watcher.start();
        },
        stop: () => {
            if (!readPathDegraded) watcher.stop();
        }
    };

    const daemon = new Daemon({
        // tunnelService is ordered BEFORE zrokService so its loopback port is bound when zrok
        // reads `backendTarget` from settings (audit F17).
        services: [
            transportService,
            httpService,
            tlsService,
            tunnelService,
            schedulerService,
            readPathService,
            ddnsService,
            zrokService
        ],
        hostPlatform: host,
        logger
    });
    await daemon.start();

    return {
        daemon,
        get port() {
            return boundPort;
        },
        stop: () => daemon.stop()
    };
}
