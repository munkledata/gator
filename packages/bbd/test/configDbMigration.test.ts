import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { DrizzleConfigStore } from "../src/data/config-db/DrizzleConfigStore";

test("an incompatible legacy config table is backed up, not dropped (no data loss)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-cfg-"));
    const dbPath = path.join(dir, "config.db");
    try {
        // Simulate a legacy-server `config` table that has no `key` column.
        const legacy = new Database(dbPath);
        legacy.exec("CREATE TABLE config (name TEXT, value TEXT)");
        legacy.prepare("INSERT INTO config (name, value) VALUES (?, ?)").run("server_port", "1234");
        legacy.close();

        // Booting the new store must preserve the legacy rows in a backup table.
        const store = new DrizzleConfigStore(dbPath);
        assert.equal(store.getConfig().socketPort, 1234, "fresh config table works (defaults)");
        assert.equal((await store.setConfig({ socketPort: 9000 })).socketPort, 9000, "new config table is writable");

        const check = new Database(dbPath);
        const backup = check
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='config_legacy_backup'")
            .get();
        assert.ok(backup, "legacy table preserved as config_legacy_backup");
        const row = check.prepare("SELECT value FROM config_legacy_backup WHERE name='server_port'").get() as {
            value: string;
        };
        assert.equal(row.value, "1234", "legacy data preserved for manual recovery");
        check.close();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("config.db is created owner-only (0600) (audit S8)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbd-perm-"));
    const dbPath = path.join(dir, "config.db");
    try {
        new DrizzleConfigStore(dbPath);
        const mode = fs.statSync(dbPath).mode & 0o777;
        assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
