import { test } from "node:test";
import assert from "node:assert/strict";
import { Supervisor, type Service } from "../src/core/lifecycle";
import { createConsoleLogger } from "../src/core/logger";
import { isOk, isErr } from "../src/core/result";

const silent = createConsoleLogger("test", { level: "fatal" });

const recordingService = (name: string, log: string[], opts: Partial<Service> = {}): Service => ({
    name,
    start: () => void log.push(`start:${name}`),
    stop: () => void log.push(`stop:${name}`),
    ...opts
});

test("starts services in registration order", async () => {
    const log: string[] = [];
    const sup = new Supervisor([recordingService("a", log), recordingService("b", log)], silent);
    const r = await sup.start();
    assert.equal(isOk(r), true);
    assert.deepEqual(log, ["start:a", "start:b"]);
});

test("rolls back already-started services when one fails", async () => {
    const log: string[] = [];
    const failing: Service = {
        name: "b",
        start: () => {
            log.push("start:b");
            throw new Error("b failed");
        }
    };
    const sup = new Supervisor(
        [recordingService("a", log), failing, recordingService("c", log)],
        silent
    );
    const r = await sup.start();
    assert.equal(isErr(r), true);
    // c never started; a was rolled back; b's stop is not called (it never fully started).
    assert.deepEqual(log, ["start:a", "start:b", "stop:a"]);
});

test("stop tears down in reverse order", async () => {
    const log: string[] = [];
    const sup = new Supervisor([recordingService("a", log), recordingService("b", log)], silent);
    await sup.start();
    await sup.stop();
    assert.deepEqual(log.filter(l => l.startsWith("stop")), ["stop:b", "stop:a"]);
});

test("health aggregates per running service", async () => {
    const log: string[] = [];
    const sup = new Supervisor(
        [recordingService("a", log, { health: () => ({ ok: true }) })],
        silent
    );
    await sup.start();
    const health = await sup.health();
    assert.deepEqual(health, { a: { ok: true } });
});
