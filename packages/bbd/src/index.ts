/**
 * @bluebubbles/bbd — public surface of the Phase-0 scaffold.
 *
 * This package is the foundation the legacy server is strangled into. It ships no
 * behavior yet; it provides the primitives (DI container, typed event bus,
 * logger abstraction, disposable registry, Result, lifecycle supervisor) and the
 * host-platform boundary, all dependency-free and unit-tested.
 */
export * from "./core/result";
export * from "./core/logger";
export * from "./core/bus";
export * from "./core/disposables";
export * from "./core/container";
export * from "./core/lifecycle";
export * from "./host-platform/capabilities";
export * from "./host-platform/electron-adapter";
export * from "./events";
export * from "./tokens";
export { composeCore, type ComposeOptions } from "./compose";

// Phase 2 — config + pluggable notifications
export * from "./config/configSchema";
export * from "./config/ConfigService";
export * from "./data/config-db/ConfigStore";
export * from "./data/config-db/DrizzleConfigStore";
export * as tables from "./data/config-db/tables";
export * from "./notifications/types";
export type { NotificationProvider } from "./notifications/NotificationProvider";
export * from "./notifications/NotificationRegistry";
export * from "./notifications/UnifiedPushProvider";
export { FcmProvider, type FcmTransport } from "./notifications/FcmProvider";
export { WebPushProvider, type WebPushTransport } from "./notifications/WebPushProvider";
export * from "./notifications/buildNotificationRegistry";
