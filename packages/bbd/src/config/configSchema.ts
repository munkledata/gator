import { z } from "zod";

/**
 * The declarative config schema.
 *
 * Replaces the legacy `handleConfigUpdate` chain and the stringly-typed config DB
 * with one validated, defaulted, typed source of truth. Reading config that has
 * been `parse`d guarantees every field is present and correctly typed; the reconcile
 * loop (ConfigService) diffs and broadcasts changes.
 */

export const ProviderNameSchema = z.enum(["unifiedpush", "fcm", "webpush"]);

export const NotificationsConfigSchema = z
    .object({
        /**
         * The default provider new devices register against. **UnifiedPush** —
         * privacy-first, self-hostable, no Google project required. FCM and Web Push
         * remain available as opt-in providers.
         */
        defaultProvider: ProviderNameSchema.default("unifiedpush"),
        unifiedpush: z
            .object({ enabled: z.boolean().default(true) })
            .default({}),
        fcm: z
            .object({
                enabled: z.boolean().default(false),
                /** Path to the Firebase service-account JSON (HTTP v1). */
                serviceAccountPath: z.string().optional()
            })
            .default({}),
        webpush: z
            .object({
                enabled: z.boolean().default(false),
                vapidPublicKey: z.string().optional(),
                vapidPrivateKey: z.string().optional(),
                vapidSubject: z.string().optional()
            })
            .default({})
    })
    .default({});

export const ConfigSchema = z
    .object({
        socketPort: z.number().int().min(1).max(65535).default(1234),
        serverAddress: z.string().default(""),
        password: z.string().default(""),
        autoCaffeinate: z.boolean().default(false),
        autoStart: z.boolean().default(false),
        enablePrivateApi: z.boolean().default(false),
        encryptComs: z.boolean().default(false),
        tunnelProvider: z.enum(["cloudflare", "zrok", "lan", "none"]).default("none"),
        notifications: NotificationsConfigSchema
    })
    // passthrough() keeps the wider legacy config surface (the UI reads ~40 snake_case
    // keys not in this typed core) so get/set-config round-trip them — e.g. the setup
    // flow's `tutorial_is_done`, zrok keys, fcm config, poll interval, auto_* flags.
    .passthrough()
    .default({});

export type Config = z.infer<typeof ConfigSchema>;
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

/** The fully-defaulted config (parsing an empty object yields every default). */
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

export function parseConfig(input: unknown): Config {
    return ConfigSchema.parse(input);
}

export function parseConfigSafe(input: unknown): z.SafeParseReturnType<unknown, Config> {
    return ConfigSchema.safeParse(input);
}
