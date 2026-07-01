import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { HelperInjector, type HelperProcessRunner } from "../src/host-platform/HelperInjector";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });

/** Let queued macrotasks (the loop's setTimeout(0) backoff) drain. */
const flush = async (n = 12): Promise<void> => {
    for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0));
};

function tmpDylib(tag: string): string {
    const p = path.join(os.tmpdir(), `bb-injtest-${tag}-${process.pid}.dylib`);
    fs.writeFileSync(p, "x");
    return p;
}

/**
 * A faithful mock of the OS runner: `spawnInjected` returns a promise that stays pending
 * (the "app is running") until either the test calls `exitOne()` or `killApp` is invoked
 * (a kill makes the running app exit) — exactly how the real lifecycle behaves.
 */
class MockRunner implements HelperProcessRunner {
    spawns: Array<{ binary: string; dylib: string }> = [];
    kills: string[] = [];
    hides: string[] = [];
    #pending: Array<() => void> = [];

    resolveAppBinary(appName: string): string | null {
        return `/Apps/${appName}`;
    }
    async killApp(appName: string): Promise<void> {
        this.kills.push(appName);
        this.#pending.shift()?.();
    }
    async hideApp(appName: string): Promise<void> {
        this.hides.push(appName);
    }
    spawnInjected(binary: string, dylib: string): Promise<void> {
        this.spawns.push({ binary, dylib });
        return new Promise<void>(resolve => this.#pending.push(resolve));
    }
    exitOne(): void {
        this.#pending.shift()?.();
    }
}

test("injects an enabled target with DYLD_INSERT and relaunches when it exits", async () => {
    const runner = new MockRunner();
    const dylib = tmpDylib("msg");
    const injector = new HelperInjector({
        runner,
        logger: silent,
        backoffMs: 0,
        hideDelayMs: 0,
        targets: [{ appName: "Messages", dylibPath: dylib, isEnabled: () => true }]
    });

    await injector.start();
    await flush();
    assert.equal(runner.spawns.length, 1, "spawned once on start");
    assert.deepEqual(runner.spawns[0], { binary: "/Apps/Messages", dylib });

    runner.exitOne(); // the app quit on its own
    await flush();
    assert.equal(runner.spawns.length, 2, "relaunched after the app exited");

    await injector.stop();
    fs.unlinkSync(dylib);
});

test("skips a disabled target (and reinject reports injected vs skipped)", async () => {
    const runner = new MockRunner();
    const msg = tmpDylib("msg2");
    const ft = tmpDylib("ft2");
    let ftEnabled = false;
    const injector = new HelperInjector({
        runner,
        logger: silent,
        backoffMs: 0,
        hideDelayMs: 0,
        targets: [
            { appName: "Messages", dylibPath: msg, isEnabled: () => true },
            { appName: "FaceTime", dylibPath: ft, isEnabled: () => ftEnabled }
        ]
    });

    await injector.start();
    await flush();
    assert.deepEqual(
        runner.spawns.map(s => s.binary),
        ["/Apps/Messages"],
        "only the enabled target is injected"
    );

    // Enable FaceTime, then reinject: both should be injected; nothing skipped.
    ftEnabled = true;
    const result = await injector.reinject();
    await flush();
    assert.deepEqual(result.injected.sort(), ["FaceTime", "Messages"]);
    assert.deepEqual(result.skipped, []);
    assert.ok(runner.spawns.some(s => s.binary === "/Apps/FaceTime"), "FaceTime injected after reinject");

    await injector.stop();
    assert.ok(runner.kills.includes("Messages") && runner.kills.includes("FaceTime"), "stop kills both apps");
    fs.unlinkSync(msg);
    fs.unlinkSync(ft);
});

test("no targets (resources dir unset) is a no-op", async () => {
    const runner = new MockRunner();
    const injector = new HelperInjector({ runner, logger: silent, targets: [], backoffMs: 0, hideDelayMs: 0 });
    await injector.start();
    await flush();
    assert.equal(runner.spawns.length, 0);
    await injector.stop();
});
