import { test } from "node:test";
import assert from "node:assert/strict";
import { ColumnSet } from "../src/data/imessage/schema";
import { INITIAL_CURSOR, buildDeltaQuery, advanceCursor, type Cursor } from "../src/data/imessage/cursor";

test("delta query includes only the date columns that exist on this schema", () => {
    // A modern schema with edit columns.
    const modern = new ColumnSet(["ROWID", "date", "date_edited", "date_retracted", "date_delivered", "date_read"]);
    const { where, params } = buildDeltaQuery(INITIAL_CURSOR, modern);
    assert.match(where, /message\.ROWID > @lastRowId/);
    assert.match(where, /message\.date_edited > @maxDateEdited/);
    assert.ok("maxDateEdited" in params);

    // A legacy schema without edit columns — must not reference them.
    const legacy = new ColumnSet(["ROWID", "date"]);
    const q2 = buildDeltaQuery(INITIAL_CURSOR, legacy);
    assert.doesNotMatch(q2.where, /date_edited/);
    assert.doesNotMatch(q2.where, /date_retracted/);
    assert.ok(!("maxDateEdited" in q2.params));
});

test("advanceCursor takes the high-water mark across a batch", () => {
    const rows = [
        { ROWID: 5, date: 100, date_edited: 0 },
        { ROWID: 9, date: 50, date_edited: 200 },
        { ROWID: 7, date: 300, date_edited: 0 }
    ];
    const next: Cursor = advanceCursor(INITIAL_CURSOR, rows);
    assert.equal(next.lastRowId, 9);
    assert.equal(next.maxDate, 300);
    assert.equal(next.maxDateEdited, 200);
});

test("advanceCursor never moves backwards", () => {
    const start: Cursor = { ...INITIAL_CURSOR, lastRowId: 100, maxDate: 999 };
    const next = advanceCursor(start, [{ ROWID: 5, date: 10 }]);
    assert.equal(next.lastRowId, 100);
    assert.equal(next.maxDate, 999);
});
