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

// Phase 3 — read path (read-only chat.db, schema introspection, durable cursor)
export * from "./data/imessage/appleConstants";
export * from "./data/imessage/schema";
export * from "./data/imessage/connection";
export * from "./data/imessage/cursor";
export * from "./data/imessage/MessageReader";
export * from "./data/imessage/ChatReader";
export * from "./data/imessage/watcher";
export * from "./data/imessage/IMessageListener";
export * from "./serialize/chatSerializer";
export * from "./api/operations/readOperations";

// Phase 4 — unified API (one service layer -> Fastify + Socket.IO adapters)
export * from "./api/Operation";
export * from "./api/auth";
export * from "./api/execute";
export * from "./api/registry";
export * from "./api/operations/coreOperations";
export * from "./api/fastifyAdapter";
export * from "./api/socketAdapter";
export * from "./api/openapi";

// Phase 5 — write path + hardened private-API transport (H1)
export * from "./private-api/framing";
export * from "./private-api/transactionManager";
export * from "./private-api/PrivateApiTransport";
export * from "./messaging/appleScriptFallback";
export * from "./messaging/MessageSender";
export * from "./serialize/messageSerializer";

// Phase 6 — networking + admin API
export * from "./networking/TunnelProvider";
export * from "./networking/webhook";
export * from "./networking/oauthPkce";
export * from "./api/operations/adminOperations";

// Phase 7 — de-Electron (headless daemon + launchd LaunchAgent)
export * from "./host-platform/launchd";
export * from "./bootstrap/daemon";
