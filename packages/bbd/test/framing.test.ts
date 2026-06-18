import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFrame, FrameDecoder } from "../src/private-api/framing";

test("round-trips a single frame", () => {
    const d = new FrameDecoder();
    const out = d.push(encodeFrame({ hello: "world" }));
    assert.deepEqual(out, [{ hello: "world" }]);
});

test("decodes multiple frames in one chunk", () => {
    const d = new FrameDecoder();
    const chunk = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: 2 }), encodeFrame({ c: 3 })]);
    assert.deepEqual(d.push(chunk), [{ a: 1 }, { b: 2 }, { c: 3 }]);
});

test("buffers a frame split across chunks (the legacy partial-frame bug)", () => {
    const d = new FrameDecoder();
    const frame = encodeFrame({ msg: "a longer payload that we will split" });
    const mid = Math.floor(frame.length / 2);
    assert.deepEqual(d.push(frame.subarray(0, mid)), [], "no frame yet");
    assert.ok(d.buffered > 0);
    assert.deepEqual(d.push(frame.subarray(mid)), [{ msg: "a longer payload that we will split" }]);
    assert.equal(d.buffered, 0);
});

test("a malformed frame is dropped without wedging the stream", () => {
    const d = new FrameDecoder();
    const bad = Buffer.allocUnsafe(4);
    bad.writeUInt32LE(3, 0);
    const out = d.push(Buffer.concat([bad, Buffer.from("xxx"), encodeFrame({ ok: true })]));
    assert.deepEqual(out, [{ ok: true }]);
});
