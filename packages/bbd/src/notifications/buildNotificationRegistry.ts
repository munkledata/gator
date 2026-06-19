import type { Logger } from "../core/logger";
import type { NotificationsConfig } from "../config/configSchema";
import { NotificationRegistry } from "./NotificationRegistry";
import { UnifiedPushProvider, type FetchLike } from "./UnifiedPushProvider";
import { WebPushProvider, type WebPushTransport } from "./WebPushProvider";

/** Injected SDK seams. Absent transports mean that provider can't be enabled. */
export interface NotificationTransports {
    fetch?: FetchLike;
    webpush?: WebPushTransport;
}

/**
 * Assemble the provider registry from config.
 *
 * UnifiedPush is registered whenever enabled (it needs no SDK and is the default —
 * privacy-first, no Google project). Web Push is registered only when both enabled AND
 * its injected transport is supplied — otherwise it's skipped with a warning, so a
 * half-configured provider can't silently swallow notifications. If the configured
 * `defaultProvider` ends up not registered, that's surfaced too.
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

    if (config.webpush.enabled) {
        if (transports.webpush) registry.register(new WebPushProvider(transports.webpush));
        else log.warn("webpush.enabled but no Web Push transport supplied; skipping Web Push provider");
    }

    if (!registry.has(config.defaultProvider)) {
        log.warn(`defaultProvider "${config.defaultProvider}" is not enabled/registered`);
    }

    return registry;
}
