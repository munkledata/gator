import { test } from "node:test";
import assert from "node:assert/strict";
import { DisposableRegistry } from "../src/core/disposables";

test("disposes in LIFO order", async () => {
    const reg = new DisposableRegistry();
    const order: number[] = [];
    reg.add(() => void order.push(1));
    reg.add(() => void order.push(2));
    reg.add(() => void order.push(3));
    await reg.disposeAll();
    assert.deepEqual(order, [3, 2, 1]);
    assert.equal(reg.isDisposed, true);
});

test("setInterval is auto-cleared on disposeAll", async () => {
    const reg = new DisposableRegistry();
    let ticks = 0;
    reg.setInterval(() => ticks++, 1);
    await new Promise(r => setTimeout(r, 12));
    await reg.disposeAll();
    const after = ticks;
    await new Promise(r => setTimeout(r, 12));
    assert.equal(ticks, after, "interval kept firing after disposeAll");
});

test("track adopts a stoppable resource", async () => {
    const reg = new DisposableRegistry();
    let stopped = false;
    const resource = reg.track({ stop: () => void (stopped = true) });
    assert.ok(resource);
    await reg.disposeAll();
    assert.equal(stopped, true);
});

test("add after disposeAll throws", async () => {
    const reg = new DisposableRegistry();
    await reg.disposeAll();
    assert.throws(() => reg.add(() => {}), /cannot add after/);
});

test("a failing disposable does not stop the others, and is aggregated", async () => {
    const reg = new DisposableRegistry();
    let ran = false;
    reg.add(() => void (ran = true));
    reg.add(() => {
        throw new Error("teardown failed");
    });
    await assert.rejects(() => reg.disposeAll(), /1 disposable\(s\) failed/);
    assert.equal(ran, true);
});

test("size reflects registered count", () => {
    const reg = new DisposableRegistry();
    assert.equal(reg.size, 0);
    reg.add(() => {});
    assert.equal(reg.size, 1);
});
