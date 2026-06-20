import type { Logger } from "../core/logger";
import type { NotificationsConfig } from "../config/configSchema";
import { NotificationRegistry } from "./NotificationRegistry";
import { FcmProvider, type FcmFetch } from "./FcmProvider";
import { nodeRs256Signer, type JwtSigner } from "./fcm/sign";
import { parseServiceAccount, type FcmServiceAccount } from "./fcm/serviceAccount";
import { WebPushProvider, type WebPushTransport } from "./WebPushProvider";

/** Injected SDK seams. Absent transports mean that provider can't be enabled. */
export interface NotificationTransports {
    /** `fetch` impl for FCM (defaults to the global). */
    fcmFetch?: FcmFetch;
    /** JWT signer for FCM (defaults to the node-crypto RS256 signer). */
    fcmSign?: JwtSigner;
    /**
     * Live accessor for the FCM service account. The backend wires this to the config
     * store so enabling/changing FCM takes effect without a restart; tests/defaults
     * fall back to reading the static config snapshot.
     */
    fcmCredentials?: () => FcmServiceAccount | null;
    webpush?: WebPushTransport;
}

/**
 * Assemble the provider registry from config.
 *
 * FCM is registered whenever enabled (the default — it's the push path for the
 * BlueBubbles app); the provider no-ops gracefully until a service account is
 * configured, so registering it before setup is harmless. Web Push is registered
 * only when both enabled AND its injected transport is supplied — otherwise it's
 * skipped with a warning, so a half-configured provider can't silently swallow
 * notifications. If the configured `defaultProvider` ends up not registered, that's
 * surfaced too.
 */
export function buildNotificationRegistry(
    config: NotificationsConfig,
    logger: Logger,
    transports: NotificationTransports = {}
): NotificationRegistry {
    const registry = new NotificationRegistry(logger);
    const log = logger.child({ component: "buildNotificationRegistry" });

    if (config.fcm.enabled) {
        registry.register(
            new FcmProvider({
                credentials: transports.fcmCredentials ?? (() => parseServiceAccount(config.fcm.serviceAccount ?? null)),
                fetch: transports.fcmFetch ?? (globalThis.fetch as unknown as FcmFetch),
                sign: transports.fcmSign ?? nodeRs256Signer
            })
        );
    }

    if (config.webpush.enabled) {
        if (transports.webpush) registry.register(new WebPushProvider(transports.webpush));
        else log.warn("webpush.enabled but no Web Push transport supplied; skipping Web Push provider");
    }

    if (!registry.has(config.defaultProvider)) {
        log.warn(`defaultProvider "${config.defaultProvider}" is not enabled/registered`);
    }

    return registry;
}
