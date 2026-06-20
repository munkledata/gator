import { z } from "zod";

/**
 * The declarative config schema.
 *
 * Replaces the legacy `handleConfigUpdate` chain and the stringly-typed config DB
 * with one validated, defaulted, typed source of truth. Reading config that has
 * been `parse`d guarantees every field is present and correctly typed; the reconcile
 * loop (ConfigService) diffs and broadcasts changes.
 */

export const ProviderNameSchema = z.enum(["fcm", "webpush"]);

const NotificationsConfigShape = z
    .object({
        /**
         * The default provider new devices register against. **FCM** (Firebase Cloud
         * Messaging) is the push path for the BlueBubbles app, delivered via the HTTP
         * v1 API from an uploaded service account. Web Push is an opt-in browser provider.
         */
        defaultProvider: ProviderNameSchema.default("fcm"),
        fcm: z
            .object({
                enabled: z.boolean().default(true),
                /**
                 * The Firebase service-account JSON (HTTP v1). Holds a private key, so it
                 * is stripped from the authenticated config API (see coreOperations).
                 * Stored as the parsed object or the raw string; {@link parseServiceAccount}
                 * accepts either.
                 */
                serviceAccount: z.unknown().optional(),
                /**
                 * The user's own Google OAuth client (a "Desktop app" client ID, no secret)
                 * for the automatic setup flow. Optional: when unset, only the manual
                 * service-account upload is available.
                 */
                oauthClientId: z.string().optional(),
                /** Only needed if the OAuth client is a "Web application" type. */
                oauthClientSecret: z.string().optional()
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

/**
 * Tolerate config persisted by an earlier build: a stored `defaultProvider` of
 * `"unifiedpush"` (the removed provider) would otherwise fail the enum and crash the
 * daemon on boot. Remap it to `"fcm"` and drop the dead `unifiedpush` sub-object
 * before validating.
 */
export const NotificationsConfigSchema = z.preprocess(val => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
        const v = { ...(val as Record<string, unknown>) };
        if (v.defaultProvider === "unifiedpush") v.defaultProvider = "fcm";
        delete v.unifiedpush;
        return v;
    }
    return val;
}, NotificationsConfigShape);

export const ConfigSchema = z
    .object({
        socketPort: z.number().int().min(1).max(65535).default(1234),
        serverAddress: z.string().default(""),
        password: z.string().default(""),
        autoCaffeinate: z.boolean().default(false),
        autoStart: z.boolean().default(false),
        enablePrivateApi: z.boolean().default(false),
        encryptComs: z.boolean().default(false),
        // Cloudflare tunnel was removed as an option; a legacy stored "cloudflare" is
        // coerced to "none" by parseConfig's preprocess so it can't fail the enum on boot.
        tunnelProvider: z.enum(["zrok", "lan", "none"]).default("none"),
        // Cloudflare dynamic DNS — keep a custom-domain A record pointed at the
        // server's current public IP (for a home/dynamic-IP server). Flat keys so the
        // UI's snake_case <-> camelCase mapping round-trips them like the other config.
        cloudflareDdnsEnabled: z.boolean().default(false),
        cloudflareDdnsApiToken: z.string().default(""),
        cloudflareDdnsRecord: z.string().default(""),
        cloudflareDdnsZone: z.string().default(""),
        cloudflareDdnsProxied: z.boolean().default(false),
        cloudflareDdnsIntervalSeconds: z.number().default(300),
        // Built-in TLS: when enabled, bbd serves HTTPS on tlsPort (0.0.0.0) for remote
        // clients, in addition to the loopback plain-HTTP listener for the local UI. A
        // self-signed cert is generated on demand; a user-supplied cert/key path overrides.
        tlsEnabled: z.boolean().default(false),
        tlsPort: z.number().int().min(1).max(65535).default(1235),
        tlsCertPath: z.string().default(""),
        tlsKeyPath: z.string().default(""),
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

/** Coerce removed/renamed enum values from older builds before validation. */
function coerceLegacy(input: unknown): unknown {
    if (input && typeof input === "object" && !Array.isArray(input)) {
        const v = { ...(input as Record<string, unknown>) };
        // Cloudflare tunnel was removed as an option.
        if (v.tunnelProvider === "cloudflare") v.tunnelProvider = "none";
        return v;
    }
    return input;
}

export function parseConfig(input: unknown): Config {
    return ConfigSchema.parse(coerceLegacy(input));
}

export function parseConfigSafe(input: unknown): z.SafeParseReturnType<unknown, Config> {
    return ConfigSchema.safeParse(coerceLegacy(input));
}
