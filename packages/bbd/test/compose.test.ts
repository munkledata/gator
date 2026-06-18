import { test } from "node:test";
import assert from "node:assert/strict";
import { composeCore } from "../src/compose";
import { LoggerToken, EventBusToken, CapabilitiesToken, HostPlatformToken } from "../src/tokens";
import { createConsoleLogger } from "../src/core/logger";

test("composeCore wires the core services into a resolvable container", () => {
    const c = composeCore();
    assert.ok(c.resolve(LoggerToken));
    assert.ok(c.resolve(EventBusToken));
    assert.equal(c.resolve(HostPlatformToken).kind, "headless");
    assert.equal(typeof c.resolve(CapabilitiesToken).version.major, "number");
});

test("the composed bus routes listener failures to the logger", () => {
    const lines: string[] = [];
    const capturing = createConsoleLogger("test", { sink: (_l, line) => lines.push(line) });
    const c = composeCore({ logger: capturing });
    const bus = c.resolve(EventBusToken);
    bus.on("hello-world", () => {
        throw new Error("listener boom");
    });
    bus.emit("hello-world", {});
    assert.ok(lines.some(l => l.includes('event "hello-world" listener failed')));
});

test("injectionViable flows through to capabilities", () => {
    assert.equal(composeCore({ injectionViable: true }).resolve(CapabilitiesToken).injectionViable, true);
});
