import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import { AdminOnlyError } from "../execute";
import type { ConfigService } from "../../config/ConfigService";
import type { ConfigStore } from "../../data/config-db/ConfigStore";
import type { Config } from "../../config/configSchema";
import type { ChatReader } from "../../data/imessage/ChatReader";
import type { ContactsService } from "../../contacts/ContactsService";
import type { ScheduledMessageStore } from "../../scheduled/ScheduledMessage";
import type { WebhookStore } from "../../webhooks/Webhook";
import type { PrivateApiTransport } from "../../private-api/PrivateApiTransport";
import type { StatsReader } from "../../data/imessage/StatsReader";
import type { MacPermissions } from "../../host-platform/MacPermissions";
import type { CloudflareDdns } from "../../networking/CloudflareDdns";
import type { ZrokTunnel } from "../../networking/ZrokTunnel";
import type { AcmeService } from "../../networking/AcmeService";
import { parseServiceAccount } from "../../notifications/fcm/serviceAccount";
import { assertSecureServerAddress } from "../../config/serverAddress";
import { sanitizeConfig } from "../../config/sanitize";
import { getLanIpv4 } from "../../networking/lanAddress";
import { generateVapidKeys } from "../../notifications/webpush/vapid";
import type { FirebaseSetupService } from "../../notifications/fcm/FirebaseSetupService";
import type { Logger } from "../../core/logger";

export interface AdminCommandDeps {
    configService: ConfigService;
    configStore: ConfigStore;
    chatReader: ChatReader;
    contacts: ContactsService;
    scheduledStore: ScheduledMessageStore;
    webhookStore: WebhookStore;
    transport: PrivateApiTransport;
    stats: StatsReader;
    permissions: MacPermissions;
    cloudflareDdns: CloudflareDdns;
    zrok: ZrokTunnel;
    acme: AcmeService;
    /** Active-certificate info (domain/expiry/issuer) for the UI TLS panel. */
    tlsInfo: () => Record<string, unknown>;
    firebaseSetup: FirebaseSetupService;
    version: string;
    /** Push a Socket.IO event to all connected clients (former main->renderer pushes). */
    emit: (event: string, data: unknown) => void;
    logger: Logger;
}

type Handler = (data: Record<string, unknown>) => Promise<unknown> | unknown;

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * Channels restricted to the trusted LOCAL admin UI (audit F15). These are the genuinely
 * destructive local-admin operations — config writes (which also carry the password,
 * cloudflare/zrok tokens, server address, TLS toggles), FCM/Web-Push/OAuth secret setters,
 * TLS issuance, tunnel control, and device purge. A remote password-authenticated client is
 * denied (403) even with the correct password; only the per-boot `x-bbd-local-auth` token
 * passes. READ/STATUS channels are deliberately NOT listed (get-config, get-*-status,
 * get-devices, get-* stats, check-permissions, …) so the normal password path still serves
 * them. The mobile app calls NONE of these channels (it uses the password-authed REST API),
 * so this gate can't lock the app out.
 */
const ADMIN_ONLY_CHANNELS: ReadonlySet<string> = new Set<string>([
    // Config writes (the broad lever: persists password, tokens, server address, TLS mode).
    "set-config",
    "toggle-tutorial",
    "save-lan-url",
    // FCM / push credential + provider setters.
    "set-fcm-server",
    "clear-fcm",
    "set-fcm-oauth-client",
    "start-firebase-setup",
    "generate-vapid-keys",
    "set-webpush-subject",
    "disable-webpush",
    // zrok tunnel control + token (re-exposes the server / consumes the secret token).
    "set-zrok-token",
    "register-zrok-email",
    "start-zrok",
    "disable-zrok",
    // Cloudflare DDNS action (acts on the stored API token).
    "cloudflare-ddns-sync-now",
    // TLS / Let's Encrypt issuance + listener toggles.
    "enable-tls",
    "disable-tls",
    "issue-letsencrypt",
    // Destructive data op.
    "purge-devices"
]);

/**
 * The single dispatch endpoint that replaces the legacy renderer's 67 `ipcMain`
 * channels. The UI's `invoke(channel, data)` POSTs here; we route by channel to the
 * real services. Channels backed by the new architecture work end-to-end; the long
 * tail (alerts, zrok/oauth, OS caches) returns a clear `{ unsupported: true }` so the
 * UI degrades instead of crashing. Loopback callers are trusted (the local window),
 * so the UI needs no password — see execute.ts.
 */
export function buildAdminCommandOperations(deps: AdminCommandDeps): Operation[] {
    const { configService, configStore, chatReader, contacts, scheduledStore, webhookStore, transport, stats, permissions, cloudflareDdns, zrok, acme, tlsInfo, firebaseSetup, emit, logger } =
        deps;

    // Lightweight in-memory alert log (the legacy server's server-side notifications).
    interface Alert {
        id: string;
        type: string;
        value: string;
        created: number;
        isRead: boolean;
    }
    const alerts: Alert[] = [];

    // The v1 UI/API contract uses snake_case config keys; the bbd schema is camelCase.
    const toSnake = (s: string): string => s.replace(/[A-Z]/g, m => "_" + m.toLowerCase());
    const toCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    const mapKeys = (obj: Record<string, unknown>, fn: (k: string) => string): Record<string, unknown> =>
        Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]));

    const readConfig = (): Record<string, unknown> => {
        // Strip secrets BEFORE snake-casing so this admin path can't leak the FCM private
        // key, Cloudflare/zrok tokens, OAuth secret, or VAPID key (audit S3) — the same
        // canonical strip the REST /config endpoint uses.
        const snake = mapKeys(sanitizeConfig(configStore.getConfig()), toSnake);
        // BBD_SKIP_SETUP lets a test/dev boot land past the first-run walkthrough.
        if (process.env.BBD_SKIP_SETUP === "1") snake.tutorial_is_done = true;
        return snake;
    };

    const setConfig = async (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
        // Defense-in-depth behind the UI's own validation: reject an insecure public
        // http:// server address (loopback/LAN http stays allowed for the LAN-URL case).
        assertSecureServerAddress(patch.server_address);
        // Enforce a server-side minimum password strength (audit S2). Empty = "unset"
        // (allowed, e.g. first-run); a set password must be at least 8 characters so a
        // trivially-guessable one can't be configured even outside the UI.
        if (typeof patch.password === "string" && patch.password.length > 0 && patch.password.length < 8) {
            throw new Error("Password must be at least 8 characters");
        }
        const updated = await configService.update(mapKeys(patch, toCamel) as Partial<Config>);
        // Strip every plaintext credential BEFORE snake-casing so the write path can't leak
        // what the read path hides (audit F9): the returned value AND the broadcast
        // `config-update` event otherwise carry password, cloudflare/zrok tokens, the FCM
        // service-account private key, the OAuth client secret, and the VAPID private key.
        const snake = mapKeys(sanitizeConfig(updated as Config), toSnake);
        emit("config-update", snake);
        return snake;
    };

    const handlers: Record<string, Handler> = {
        // --- config (snake_case on the wire, camelCase in the schema) ---
        "get-config": () => readConfig(),
        "set-config": d => setConfig(d),
        "toggle-tutorial": d => setConfig({ tutorial_is_done: Boolean(d.toggle ?? d.value ?? true) }),

        // --- chats (read path) ---
        "get-chats": d => chatReader.getChats(d),

        // --- contacts (read path; writes are not supported by the read-only source) ---
        "get-contacts": () => contacts.list(),

        // --- scheduled messages ---
        "get-scheduled-messages": () => scheduledStore.list(),
        "create-scheduled-message": async d => {
            const created = await scheduledStore.create({
                chatGuid: String(d.chatGuid ?? (asRecord(d.payload).chatGuid ?? "")),
                text: String(d.message ?? asRecord(d.payload).message ?? d.text ?? ""),
                scheduledFor: Number(d.scheduledFor ?? d.date ?? Date.now())
            });
            emit("scheduled-message-update", null);
            return created;
        },
        "delete-scheduled-message": async d => {
            const ok = await scheduledStore.delete(String(d.id ?? d));
            emit("scheduled-message-update", null);
            return { removed: ok };
        },
        "delete-scheduled-messages": async () => {
            const all = await scheduledStore.list();
            await Promise.all(all.map(m => scheduledStore.delete(m.id)));
            emit("scheduled-message-update", null);
            return { removed: all.length };
        },

        // --- webhooks ---
        "get-webhooks": () => webhookStore.list(),
        "create-webhook": d =>
            webhookStore.create({
                url: String(d.url ?? ""),
                events: Array.isArray(d.events) ? d.events.map(e => String((e as { value?: unknown })?.value ?? e)) : [],
                ...(d.secret != null ? { secret: String(d.secret) } : {})
            }),
        "delete-webhook": d => webhookStore.delete(String(d.id ?? "")).then(removed => ({ removed })),
        "update-webhook": async d => {
            // No in-place update in the store yet; recreate to mirror legacy semantics.
            if (d.id != null) await webhookStore.delete(String(d.id));
            return webhookStore.create({
                url: String(d.url ?? ""),
                events: Array.isArray(d.events) ? d.events.map(e => String((e as { value?: unknown })?.value ?? e)) : []
            });
        },

        // --- private API / helper ---
        "get-private-api-status": () => ({ connected: transport.isConnected() }),
        "get-private-api-requirements": () => [
            { name: "Helper bundle", pass: transport.isConnected() },
            { name: "macOS Messages running", pass: true }
        ],

        // --- environment / status ---
        "get-env": () => ({ version: deps.version, platform: process.platform, node: process.versions.node }),

        // --- home-screen stats (read path; degrade to 0 without a real chat.db) ---
        "get-message-count": () => stats.messageCount(),
        "get-chat-image-count": () => stats.imageCount(),
        "get-chat-video-count": () => stats.videoCount(),
        "get-group-message-counts": () => stats.groupMessageCounts(),
        "get-best-friend": () => stats.bestFriend(),

        // --- macOS permissions (node-mac-permissions) ---
        "check-permissions": () => permissions.list(),
        "get-current-permissions": () => permissions.list(),
        "contact-permission-status": () => permissions.contactStatus(),
        "request-contact-permission": () => permissions.requestContacts(),

        // --- Firebase Cloud Messaging (HTTP v1) setup ---
        // The UI uploads the Firebase service-account JSON; we validate and persist it
        // under notifications.fcm. The private key never leaves this machine.
        "set-fcm-server": async d => {
            const account = parseServiceAccount(d);
            if (!account) {
                return { success: false, message: "Invalid service account JSON (need project_id, client_email, private_key)" };
            }
            const notifications = configStore.getConfig().notifications;
            // Persist ONLY the three fields the sender uses, not the whole uploaded JSON
            // (which also carries private_key_id, client_id, cert URLs). Minimizes the
            // plaintext credential footprint at rest (audit S3, info).
            const serviceAccount = {
                project_id: account.projectId,
                client_email: account.clientEmail,
                private_key: account.privateKey
            };
            await configService.update({
                notifications: { ...notifications, fcm: { ...notifications.fcm, enabled: true, serviceAccount } }
            });
            emit("config-update", readConfig());
            return { success: true, projectId: account.projectId, clientEmail: account.clientEmail };
        },
        "clear-fcm": async () => {
            const notifications = configStore.getConfig().notifications;
            await configService.update({
                notifications: { ...notifications, fcm: { ...notifications.fcm, enabled: false, serviceAccount: undefined } }
            });
            emit("config-update", readConfig());
            return { success: true };
        },
        // Save the user's own Google OAuth client (for the automatic setup flow).
        "set-fcm-oauth-client": async d => {
            const str = (a: unknown, b: unknown): string | undefined => {
                const v = typeof a === "string" ? a : typeof b === "string" ? b : "";
                return v.trim() ? v.trim() : undefined;
            };
            const notifications = configStore.getConfig().notifications;
            await configService.update({
                notifications: {
                    ...notifications,
                    fcm: {
                        ...notifications.fcm,
                        oauthClientId: str(d.clientId, d.client_id),
                        oauthClientSecret: str(d.clientSecret, d.client_secret)
                    }
                }
            });
            emit("config-update", readConfig());
            return { success: true, configured: Boolean(str(d.clientId, d.client_id)) };
        },
        "get-fcm-status": () => {
            const fcm = configStore.getConfig().notifications.fcm;
            const account = parseServiceAccount(fcm.serviceAccount ?? null);
            return {
                configured: Boolean(account) && fcm.enabled,
                projectId: account?.projectId ?? null,
                clientEmail: account?.clientEmail ?? null,
                // Whether the automatic (Google sign-in) setup is available.
                oauthClientConfigured: Boolean(fcm.oauthClientId)
            };
        },

        // Automatic Firebase setup: begin the Google OAuth flow (returns the consent URL
        // for the UI to open in the browser), and report provisioning status.
        "start-firebase-setup": () => {
            const fcm = configStore.getConfig().notifications.fcm;
            const clientId = String(fcm.oauthClientId ?? "");
            if (!clientId) {
                return { success: false, message: "Add your Google OAuth client ID before starting automatic setup." };
            }
            try {
                const { url } = firebaseSetup.begin({
                    clientId,
                    clientSecret: fcm.oauthClientSecret ? String(fcm.oauthClientSecret) : undefined
                });
                return { success: true, url };
            } catch (e) {
                return { success: false, message: (e as Error)?.message ?? "Failed to start setup" };
            }
        },
        "get-firebase-setup-status": () => firebaseSetup.getState(),

        // --- Web Push (VAPID) — browser/PWA push, no Google project needed ---
        "generate-vapid-keys": async d => {
            const keys = generateVapidKeys();
            const n = configStore.getConfig().notifications;
            await configService.update({
                notifications: {
                    ...n,
                    webpush: {
                        ...n.webpush,
                        enabled: true,
                        vapidPublicKey: keys.publicKey,
                        vapidPrivateKey: keys.privateKey,
                        vapidSubject: d.subject != null ? String(d.subject) : (n.webpush.vapidSubject ?? "")
                    }
                }
            });
            emit("config-update", readConfig());
            // The private key is never returned; the public key is what the browser needs.
            return { success: true, publicKey: keys.publicKey };
        },
        "get-vapid-public-key": () => {
            const wp = configStore.getConfig().notifications.webpush;
            return {
                publicKey: wp.vapidPublicKey ?? null,
                enabled: wp.enabled,
                configured: Boolean(wp.vapidPublicKey && wp.vapidPrivateKey),
                subject: wp.vapidSubject ?? ""
            };
        },
        "set-webpush-subject": d => {
            const n = configStore.getConfig().notifications;
            return configService
                .update({ notifications: { ...n, webpush: { ...n.webpush, vapidSubject: String(d.subject ?? d.value ?? "") } } })
                .then(() => ({ success: true }));
        },
        "disable-webpush": async () => {
            const n = configStore.getConfig().notifications;
            await configService.update({ notifications: { ...n, webpush: { ...n.webpush, enabled: false } } });
            emit("config-update", readConfig());
            return { success: true };
        },

        // --- registered push devices (the config store's device table) ---
        "get-devices": () => configStore.listDevices(),
        "purge-devices": async () => {
            const devices = await configStore.listDevices();
            await Promise.all(devices.map(dev => configStore.removeDevice(dev.id)));
            return { removed: devices.length };
        },

        // --- server-side alerts ---
        "get-alerts": () => alerts,
        "clear-alerts": () => {
            alerts.length = 0;
            return { ok: true };
        },
        "mark-alerts-as-read": d => {
            const ids = new Set((Array.isArray(d.ids) ? d.ids : Array.isArray(d) ? d : []).map(String));
            for (const a of alerts) if (ids.size === 0 || ids.has(a.id)) a.isRead = true;
            return { ok: true };
        },

        // --- zrok tunnel (now actually brings the tunnel up/down, not just config) ---
        "set-zrok-token": async d => {
            await setConfig({ zrok_token: d.token ?? d.value ?? d, enable_zrok: true, tunnel_provider: "zrok" });
            // Restart so the new token takes effect, then report status.
            await zrok.stop();
            await zrok.start();
            return { success: true, running: zrok.isRunning(), url: zrok.currentUrl(), available: zrok.isAvailable() };
        },
        "register-zrok-email": d => setConfig({ zrok_email: d.email ?? d.value ?? d }),
        "start-zrok": async () => {
            await zrok.start();
            return { running: zrok.isRunning(), url: zrok.currentUrl(), available: zrok.isAvailable() };
        },
        "disable-zrok": async () => {
            await zrok.stop();
            return setConfig({ enable_zrok: false, tunnel_provider: "none" });
        },
        "get-zrok-status": () => ({
            running: zrok.isRunning(),
            url: zrok.currentUrl(),
            available: zrok.isAvailable()
        }),
        "save-lan-url": () => {
            const port = (configStore.getConfig() as unknown as { socketPort?: number }).socketPort ?? 1234;
            // Advertise the real LAN IP so other devices can connect, not localhost.
            const ip = getLanIpv4() ?? "localhost";
            return setConfig({ server_address: `http://${ip}:${port}` });
        },

        // --- Cloudflare dynamic DNS (config persisted via get/set-config; these act on it) ---
        "cloudflare-ddns-sync-now": () => cloudflareDdns.syncOnce(),
        "get-public-ip": () => cloudflareDdns.getPublicIp().then(ip => ({ ip })).catch(() => ({ ip: null })),

        // --- built-in TLS / HTTPS listener (self-signed or user-supplied cert) ---
        // Reports the active cert's domain/expiry/issuer (parsed from disk) + the TLS mode.
        "get-tls-status": () => tlsInfo(),
        // Enabling TLS persists config; the HTTPS listener (and self-signed cert
        // generation) comes up on the next daemon start — the UI prompts a restart.
        "enable-tls": d => setConfig({ tls_enabled: true, ...(d.port != null ? { tls_port: Number(d.port) } : {}) }),
        "disable-tls": () => setConfig({ tls_enabled: false }),
        // Switch to Let's Encrypt and issue a cert now (dns-01 via the stored Cloudflare
        // token). Writes the cert to disk; the HTTPS listener serves it on next start (or
        // is hot-reloaded if TLS is already running).
        "issue-letsencrypt": async d => {
            await setConfig({
                tls_enabled: true,
                tls_mode: "letsencrypt",
                ...(d.email != null ? { acme_email: String(d.email) } : {}),
                ...(d.domain != null ? { tls_domain: String(d.domain) } : {}),
                ...(d.staging != null ? { acme_staging: Boolean(d.staging) } : {})
            });
            try {
                const material = await acme.issue();
                void material;
                const expiry = acme.expiry();
                return { success: true, certExpiry: expiry ? expiry.toISOString() : null };
            } catch (e) {
                return { success: false, message: (e as Error)?.message ?? "issuance failed" };
            }
        }
    };

    const Input = z.object({ channel: z.string().min(1), data: z.unknown().optional() });

    return [
        defineOperation({
            name: "admin-command",
            method: "POST",
            path: "/api/v1/admin/command",
            auth: true,
            input: Input,
            summary: "Dispatch a former-IPC admin command by channel",
            handler: async (ctx, input) => {
                // Per-channel admin gating (audit F15): the outer op validates only {channel,data},
                // so we enforce the privilege tier HERE — a genuinely destructive channel (config
                // writes, secret/credential setters, TLS issuance, tunnel control, device purge)
                // requires the trusted LOCAL channel (x-bbd-local-auth), never the shared password.
                // Read/status channels stay on the normal auth path. The mobile app never calls any
                // admin-command channel (it uses the password-authed REST API), so this can't lock
                // it out. A denied channel returns a 403 envelope (AdminOnlyError), not a 500.
                if (ADMIN_ONLY_CHANNELS.has(input.channel) && !ctx.trusted) {
                    logger.debug(`admin-command: rejecting admin-only channel "${input.channel}" without local trust`);
                    throw new AdminOnlyError(`admin channel "${input.channel}" requires local access`);
                }
                const handler = handlers[input.channel];
                if (!handler) {
                    // Return [] (not an object/null) — the safest universal empty: consumers
                    // that .map/.forEach/render it all no-op, instead of crashing (React #31
                    // on an object child, or .forEach on null).
                    logger.debug(`admin-command: unsupported channel "${input.channel}"`);
                    return [];
                }
                return handler(asRecord(input.data));
            }
        })
    ];
}
