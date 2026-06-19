import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
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
    version: string;
    /** Push a Socket.IO event to all connected clients (former main->renderer pushes). */
    emit: (event: string, data: unknown) => void;
    logger: Logger;
}

type Handler = (data: Record<string, unknown>) => Promise<unknown> | unknown;

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * The single dispatch endpoint that replaces the legacy renderer's 67 `ipcMain`
 * channels. The UI's `invoke(channel, data)` POSTs here; we route by channel to the
 * real services. Channels backed by the new architecture work end-to-end; the long
 * tail (alerts, zrok/oauth, OS caches) returns a clear `{ unsupported: true }` so the
 * UI degrades instead of crashing. Loopback callers are trusted (the local window),
 * so the UI needs no password — see execute.ts.
 */
export function buildAdminCommandOperations(deps: AdminCommandDeps): Operation[] {
    const { configService, configStore, chatReader, contacts, scheduledStore, webhookStore, transport, stats, permissions, emit, logger } =
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
        const snake = mapKeys(configStore.getConfig() as Record<string, unknown>, toSnake);
        // BBD_SKIP_SETUP lets a test/dev boot land past the first-run walkthrough.
        if (process.env.BBD_SKIP_SETUP === "1") snake.tutorial_is_done = true;
        return snake;
    };

    const setConfig = async (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const updated = await configService.update(mapKeys(patch, toCamel) as Partial<Config>);
        const snake = mapKeys(updated as Record<string, unknown>, toSnake);
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

        // --- tunnel config (the lifecycle/provisioning is config-backed for now) ---
        "set-zrok-token": d => setConfig({ zrok_token: d.token ?? d.value ?? d }),
        "register-zrok-email": d => setConfig({ zrok_email: d.email ?? d.value ?? d }),
        "disable-zrok": () => setConfig({ enable_zrok: false, tunnel_provider: "none" }),
        "save-lan-url": () => {
            const port = (configStore.getConfig() as unknown as { socketPort?: number }).socketPort ?? 1234;
            return setConfig({ server_address: `http://localhost:${port}` });
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
            handler: async (_ctx, input) => {
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
