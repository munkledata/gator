import { z } from "zod";
import { randomUUID } from "node:crypto";
import { defineOperation, type Operation } from "../Operation";
import type { ConfigStore } from "../../data/config-db/ConfigStore";
import type { Device } from "../../notifications/types";

/** Permissive "no meaningful input" schema. */
const NoInput = z.object({}).passthrough();

/** Device registration — the pluggable-provider model surfaces here as a
 *  discriminated union, so validation enforces the right field per provider. */
const RegisterDeviceInput = z.discriminatedUnion("provider", [
    z.object({ name: z.string().min(1), provider: z.literal("unifiedpush"), endpoint: z.string().url() }),
    z.object({
        name: z.string().min(1),
        provider: z.literal("webpush"),
        subscription: z.object({
            endpoint: z.string().url(),
            keys: z.object({ p256dh: z.string(), auth: z.string() })
        })
    })
]);

export interface CoreOperationDeps {
    configStore: ConfigStore;
    version: string;
    now?: () => number;
}

/** Strip secrets before returning config over the wire. */
function sanitizeConfig(deps: CoreOperationDeps) {
    const { password, ...rest } = deps.configStore.getConfig();
    void password;
    return rest;
}

/**
 * A representative slice of operations, each defined once and exposed on both
 * transports. The full ~39-handler surface is migrated incrementally by adding
 * operations here; the adapters and auth never change.
 */
export function buildCoreOperations(deps: CoreOperationDeps): Operation[] {
    const now = deps.now ?? (() => Date.now());
    return [
        defineOperation({
            name: "ping",
            method: "GET",
            path: "/api/v1/ping",
            auth: false,
            input: NoInput,
            summary: "Liveness check",
            handler: () => ({ pong: true })
        }),
        defineOperation({
            name: "server-info",
            method: "GET",
            path: "/api/v1/server/info",
            auth: true,
            input: NoInput,
            summary: "Server version and metadata",
            handler: () => ({ version: deps.version })
        }),
        defineOperation({
            name: "get-config",
            method: "GET",
            path: "/api/v1/config",
            auth: true,
            input: NoInput,
            summary: "Current configuration (secrets stripped)",
            handler: () => sanitizeConfig(deps)
        }),
        defineOperation({
            name: "list-devices",
            method: "GET",
            path: "/api/v1/devices",
            auth: true,
            input: NoInput,
            summary: "Registered push devices",
            handler: async () => ({ devices: await deps.configStore.listDevices() })
        }),
        defineOperation({
            name: "register-device",
            method: "POST",
            path: "/api/v1/devices",
            auth: true,
            input: RegisterDeviceInput,
            summary: "Register a device for push (any provider)",
            handler: async (_ctx, input) => {
                const base = { id: randomUUID(), name: input.name, createdAt: now() };
                let device: Device;
                switch (input.provider) {
                    case "unifiedpush":
                        device = { ...base, provider: "unifiedpush", endpoint: input.endpoint };
                        break;
                    case "webpush":
                        device = { ...base, provider: "webpush", subscription: input.subscription };
                        break;
                }
                await deps.configStore.upsertDevice(device);
                return { id: device.id };
            }
        }),
        defineOperation({
            name: "remove-device",
            method: "DELETE",
            path: "/api/v1/devices/:id",
            auth: true,
            input: z.object({ id: z.string().min(1) }),
            summary: "Remove a registered device",
            handler: async (_ctx, input) => {
                await deps.configStore.removeDevice(input.id);
                return { removed: input.id };
            }
        })
    ];
}
