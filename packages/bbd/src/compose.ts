/**
 * Composition root — wires the core services into a {@link Container}.
 *
 * This is the shape the legacy `Server()` god-object collapses into: instead of a
 * singleton holding ~25 nullable fields, the container holds lazily-constructed,
 * individually-testable services keyed by token. During the strangler migration,
 * the legacy `Server()` becomes a thin facade whose getters call
 * `container.resolve(...)`, so the 74 files referencing it keep compiling while
 * the implementation moves underneath them.
 */
import { Container } from "./core/container";
import { EventBus } from "./core/bus";
import { DisposableRegistry } from "./core/disposables";
import { createConsoleLogger, type Logger } from "./core/logger";
import { computeCapabilities } from "./host-platform/capabilities";
import { HeadlessHostPlatform, type HostPlatform } from "./host-platform/electron-adapter";
import type { DomainEvents } from "./events";
import {
    LoggerToken,
    EventBusToken,
    CapabilitiesToken,
    HostPlatformToken,
    DisposablesToken
} from "./tokens";

export interface ComposeOptions {
    /** Override the host platform (defaults to headless). The Electron impl is registered here during migration. */
    hostPlatform?: HostPlatform;
    /** Override the root logger (tests inject a capturing one). */
    logger?: Logger;
    /** Whether private-API injection is viable on this host (SIP fact from the adapter). */
    injectionViable?: boolean;
}

export function composeCore(options: ComposeOptions = {}): Container {
    const container = new Container();

    container.registerValue(HostPlatformToken, options.hostPlatform ?? new HeadlessHostPlatform());
    container.registerValue(DisposablesToken, new DisposableRegistry());

    container.register(LoggerToken, () => options.logger ?? createConsoleLogger("bbd"));

    container.register(CapabilitiesToken, () =>
        computeCapabilities({ injectionViable: options.injectionViable ?? false })
    );

    container.register(
        EventBusToken,
        c =>
            new EventBus<DomainEvents>((event, error) =>
                c.resolve(LoggerToken).error(`event "${String(event)}" listener failed`, error)
            )
    );

    return container;
}
