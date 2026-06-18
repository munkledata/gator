import { test } from "node:test";
import assert from "node:assert/strict";
import { Daemon } from "../src/bootstrap/daemon";
import type { Service } from "../src/core/lifecycle";
import type { HostPlatform } from "../src/host-platform/electron-adapter";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });

class FakeHost implements HostPlatform {
    readonly kind = "headless" as const;
    quitHandler?: () => Promise<void> | void;
    userDataPath() {
        return "/tmp";
    }
    logsPath() {
        return "/tmp";
    }
    onBeforeQuit(h: () => Promise<void> | void) {
        this.quitHandler = h;
    }
    quit() {}
}

function svc(name: string, log: string[]): Service {
    return { name, start: () => void log.push(`start:${name}`), stop: () => void log.push(`stop:${name}`) };
}

test("daemon starts services in order and wires graceful shutdown to the host", async () => {
    const log: string[] = [];
    const host = new FakeHost();
    const d = new Daemon({ services: [svc("a", log), svc("b", log)], hostPlatform: host, logger: silent });
    await d.start();
    assert.deepEqual(log, ["start:a", "start:b"]);
    assert.ok(host.quitHandler, "onBeforeQuit registered");
    await host.quitHandler!(); // simulate a quit signal
    assert.deepEqual(log.filter(l => l.startsWith("stop")), ["stop:b", "stop:a"]);
});

test("a failing service rolls back and start throws (no half-init)", async () => {
    const log: string[] = [];
    const failing: Service = {
        name: "b",
        start: () => {
            throw new Error("b failed");
        }
    };
    const d = new Daemon({ services: [svc("a", log), failing], hostPlatform: new FakeHost(), logger: silent });
    await assert.rejects(() => d.start(), /b failed/);
    assert.deepEqual(log, ["start:a", "stop:a"]);
});

test("defaults to a headless host platform (no Electron)", async () => {
    const d = new Daemon({ services: [], logger: silent });
    await d.start();
    assert.deepEqual(await d.health(), {});
    await d.stop();
});
