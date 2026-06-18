/**
 * The DI tokens for bbd's core services. Components depend on these tokens, not
 * on a global — this is the registry that replaces the legacy `Server().<field>`
 * ambient access.
 */
import { token } from "./core/container";
import type { Logger } from "./core/logger";
import type { EventBus } from "./core/bus";
import type { Capabilities } from "./host-platform/capabilities";
import type { HostPlatform } from "./host-platform/electron-adapter";
import type { DisposableRegistry } from "./core/disposables";
import type { DomainEvents } from "./events";
import type { ConfigStore } from "./data/config-db/ConfigStore";
import type { ConfigService } from "./config/ConfigService";
import type { NotificationRegistry } from "./notifications/NotificationRegistry";

export const LoggerToken = token<Logger>("Logger");
export const EventBusToken = token<EventBus<DomainEvents>>("EventBus");
export const CapabilitiesToken = token<Capabilities>("Capabilities");
export const HostPlatformToken = token<HostPlatform>("HostPlatform");
export const DisposablesToken = token<DisposableRegistry>("DisposableRegistry");
export const ConfigStoreToken = token<ConfigStore>("ConfigStore");
export const ConfigServiceToken = token<ConfigService>("ConfigService");
export const NotificationRegistryToken = token<NotificationRegistry>("NotificationRegistry");
