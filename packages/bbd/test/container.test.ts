import { test } from "node:test";
import assert from "node:assert/strict";
import { Container, token } from "../src/core/container";

test("resolves a registered factory and memoizes it", () => {
    const c = new Container();
    const Counter = token<{ n: number }>("Counter");
    let constructed = 0;
    c.register(Counter, () => {
        constructed++;
        return { n: 42 };
    });
    const a = c.resolve(Counter);
    const b = c.resolve(Counter);
    assert.equal(a.n, 42);
    assert.equal(a, b, "same singleton instance");
    assert.equal(constructed, 1, "factory ran once");
});

test("registerValue stores a pre-built value", () => {
    const c = new Container();
    const Name = token<string>("Name");
    c.registerValue(Name, "bbd");
    assert.equal(c.resolve(Name), "bbd");
});

test("factories can resolve their own dependencies from the container", () => {
    const c = new Container();
    const A = token<number>("A");
    const B = token<number>("B");
    c.registerValue(A, 10);
    c.register(B, cc => cc.resolve(A) + 5);
    assert.equal(c.resolve(B), 15);
});

test("unknown token throws a helpful error", () => {
    const c = new Container();
    const Missing = token<number>("Missing");
    assert.throws(() => c.resolve(Missing), /nothing registered for token "Missing"/);
});

test("detects circular dependencies", () => {
    const c = new Container();
    const X = token<number>("X");
    const Y = token<number>("Y");
    c.register(X, cc => cc.resolve(Y));
    c.register(Y, cc => cc.resolve(X));
    assert.throws(() => c.resolve(X), /circular dependency/);
});

test("has() reflects registration", () => {
    const c = new Container();
    const T = token<number>("T");
    assert.equal(c.has(T), false);
    c.registerValue(T, 1);
    assert.equal(c.has(T), true);
});
