import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../src/core/bus";

interface Events {
    ping: number;
    hello: string;
}

test("on/emit delivers payloads to listeners", () => {
    const bus = new EventBus<Events>();
    const seen: number[] = [];
    bus.on("ping", n => seen.push(n));
    bus.emit("ping", 1);
    bus.emit("ping", 2);
    assert.deepEqual(seen, [1, 2]);
});

test("unsubscribe stops delivery", () => {
    const bus = new EventBus<Events>();
    let count = 0;
    const off = bus.on("ping", () => count++);
    bus.emit("ping", 1);
    off();
    bus.emit("ping", 1);
    assert.equal(count, 1);
    assert.equal(bus.listenerCount("ping"), 0);
});

test("once fires exactly one time", () => {
    const bus = new EventBus<Events>();
    let count = 0;
    bus.once("hello", () => count++);
    bus.emit("hello", "a");
    bus.emit("hello", "b");
    assert.equal(count, 1);
});

test("a throwing listener is isolated and routed to onError", () => {
    const errors: unknown[] = [];
    const bus = new EventBus<Events>((_event, e) => errors.push(e));
    let reachedSecond = false;
    bus.on("ping", () => {
        throw new Error("bad listener");
    });
    bus.on("ping", () => {
        reachedSecond = true;
    });
    bus.emit("ping", 1);
    assert.equal(reachedSecond, true, "second listener still ran");
    assert.equal(errors.length, 1);
});

test("emit snapshots listeners so mutation during dispatch is safe", () => {
    const bus = new EventBus<Events>();
    let runs = 0;
    bus.on("ping", () => {
        runs++;
        bus.on("ping", () => runs++); // added mid-dispatch; must not run this round
    });
    bus.emit("ping", 1);
    assert.equal(runs, 1);
});
