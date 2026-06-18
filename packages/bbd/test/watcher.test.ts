import { test } from "node:test";
import assert from "node:assert/strict";
import { Debouncer } from "../src/data/imessage/watcher";

test("Debouncer coalesces a burst into one trailing call", async () => {
    let calls = 0;
    const d = new Debouncer(() => calls++, 20);
    d.trigger();
    d.trigger();
    d.trigger();
    assert.equal(d.pending, true);
    assert.equal(calls, 0, "not called synchronously");
    await new Promise(r => setTimeout(r, 40));
    assert.equal(calls, 1, "called exactly once after the window");
    assert.equal(d.pending, false);
});

test("Debouncer fires again for a new burst after settling", async () => {
    let calls = 0;
    const d = new Debouncer(() => calls++, 15);
    d.trigger();
    await new Promise(r => setTimeout(r, 30));
    d.trigger();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(calls, 2);
});

test("cancel prevents a pending call", async () => {
    let calls = 0;
    const d = new Debouncer(() => calls++, 15);
    d.trigger();
    d.cancel();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(calls, 0);
});
