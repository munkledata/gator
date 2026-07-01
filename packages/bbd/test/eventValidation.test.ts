import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHelperEvent } from "../src/private-api/eventValidation";

test("valid helper frames pass through (unknown fields preserved)", () => {
    assert.deepEqual(parseHelperEvent("typing-indicator", { chatGuid: "c", display: true }), {
        chatGuid: "c",
        display: true
    });
    // Unknown event types still pass the envelope check (forward-compat with new helper events).
    assert.deepEqual(parseHelperEvent("some-future-event", { a: 1 }), { a: 1 });
    // Empty object data is valid.
    assert.deepEqual(parseHelperEvent("read-status", {}), {});
});

test("malformed frames are dropped (null)", () => {
    assert.equal(parseHelperEvent("", { a: 1 }), null); // empty event name
    assert.equal(parseHelperEvent("evt", "a string"), null); // data not an object
    assert.equal(parseHelperEvent("evt", 42), null); // data not an object
    assert.equal(parseHelperEvent("evt", ["arr"]), null); // arrays rejected
    assert.equal(parseHelperEvent("evt", null), null); // null data
});
