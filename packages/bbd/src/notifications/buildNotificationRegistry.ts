import type { Logger } from "../core/logger";
import type { NotificationsConfig } from "../config/configSchema";
import { NotificationRegistry } from "./NotificationRegistry";
import { UnifiedPushProvider, type FetchLike } from "./UnifiedPushProvider";
import { FcmProvider, type FcmTransport } from "./FcmProvider";
import { WebPushProvider, type WebPushTransport } from "./WebPushProvider";

/** Injected SDK seams. Absent transports mean that provider can't be enabled. */
export interface NotificationTransports {
    fetch?: FetchLike;
    fcm?: FcmTransport;
    webpush?: WebPushTransport;
}

/**
 * Assemble the provider registry from config.
 *
 * UnifiedPush is registered whenever enabled (it needs no SDK). FCM and Web Push are
 * registered only when both enabled AND their injected transport is supplied —
 * otherwise they're skipped with a warning, so a half-configured provider can't
 * silently swallow notifications. If the configured `defaultProvider` ends up not
 * registered, that's surfaced too.
 */
export function buildNotificationRegistry(
    config: NotificationsConfig,
    logger: Logger,
    transports: NotificationTransports = {}
): NotificationRegistry {
    const registry = new NotificationRegistry(logger);
    const log = logger.child({ component: "buildNotificationRegistry" });

    if (config.unifiedpush.enabled) {
        registry.register(new UnifiedPushProvider(transports.fetch));
    }

    if (config.fcm.enabled) {
        if (transports.fcm) registry.register(new FcmProvider(transports.fcm));
        else log.warn("fcm.enabled but no FCM transport supplied; skipping FCM provider");
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
