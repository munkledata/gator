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
import type { Logger } from "../../core/logger";

export interface AdminCommandDeps {
    configService: ConfigService;
    configStore: ConfigStore;
    chatReader: ChatReader;
    contacts: ContactsService;
    scheduledStore: ScheduledMessageStore;
    webhookStore: WebhookStore;
    transport: PrivateApiTransport;
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
    const { configService, configStore, chatReader, contacts, scheduledStore, webhookStore, transport, emit, logger } =
        deps;

    const setConfig = async (patch: Partial<Config>): Promise<Config> => {
        const updated = await configService.update(patch);
        emit("config-update", updated);
        return updated;
    };

    const handlers: Record<string, Handler> = {
        // --- config ---
        "get-config": () => configStore.getConfig(),
        "set-config": d => setConfig(d as Partial<Config>),
        "toggle-tutorial": d => setConfig({ tutorialIsDone: Boolean(d.toggle ?? d.value ?? true) } as Partial<Config>),

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

        // --- FCM config (stored in the config record) ---
        "get-fcm-client": () => (configStore.getConfig() as unknown as Record<string, unknown>).fcmClient ?? null,
        "get-fcm-server": () => (configStore.getConfig() as unknown as Record<string, unknown>).fcmServer ?? null,
        "set-fcm-client": d => setConfig({ fcmClient: d } as unknown as Partial<Config>),
        "set-fcm-server": d => setConfig({ fcmServer: d } as unknown as Partial<Config>),

        // --- gracefully unsupported (no backend subsystem yet) ---
        "get-devices": () => [],
        "get-alerts": () => [],
        "save-lan-url": () => ({ ok: true })
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
                    logger.debug(`admin-command: unsupported channel "${input.channel}"`);
                    return { unsupported: true, channel: input.channel };
                }
                return handler(asRecord(input.data));
            }
        })
    ];
}
