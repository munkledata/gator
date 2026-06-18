import { test } from "node:test";
import assert from "node:assert/strict";
import { TransactionManager } from "../src/private-api/transactionManager";

test("resolve settles the matching transaction and evicts it", async () => {
    const tm = new TransactionManager<string>();
    const p = tm.create("t1");
    assert.equal(tm.size, 1);
    assert.equal(tm.resolve("t1", "done"), true);
    assert.equal(await p, "done");
    assert.equal(tm.size, 0, "evicted after resolve (no leak)");
});

test("resolve on an unknown id is a no-op", () => {
    const tm = new TransactionManager();
    assert.equal(tm.resolve("nope", null), false);
});

test("reject settles with the error and evicts", async () => {
    const tm = new TransactionManager();
    const p = tm.create("t1");
    tm.reject("t1", new Error("boom"));
    await assert.rejects(() => p, /boom/);
    assert.equal(tm.size, 0);
});

test("a transaction times out and is evicted", async () => {
    const tm = new TransactionManager();
    const p = tm.create("t1", 10);
    await assert.rejects(() => p, /timed out/);
    assert.equal(tm.size, 0);
});

test("rejectAll fails every pending transaction (e.g. on disconnect)", async () => {
    const tm = new TransactionManager();
    const a = tm.create("a");
    const b = tm.create("b");
    tm.rejectAll(new Error("disconnected"));
    await assert.rejects(() => a, /disconnected/);
    await assert.rejects(() => b, /disconnected/);
    assert.equal(tm.size, 0);
});
