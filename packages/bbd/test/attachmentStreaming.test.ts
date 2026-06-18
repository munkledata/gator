import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AttachmentStreamer } from "../src/data/imessage/AttachmentStreamer";
import { mountAttachmentRoutes } from "../src/api/attachmentRoutes";

function tmpRoot(): string {
    const root = path.join(os.tmpdir(), `bbd-att-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(root, { recursive: true });
    return root;
}

function seed(root: string, filePath: string) {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE attachment(ROWID INTEGER PRIMARY KEY, guid TEXT, filename TEXT, mime_type TEXT, transfer_name TEXT)");
    db.prepare("INSERT INTO attachment(guid, filename, mime_type, transfer_name) VALUES (?,?,?,?)")
        .run("att-ok", filePath, "image/png", "pic.png");
    db.prepare("INSERT INTO attachment(guid, filename, mime_type, transfer_name) VALUES (?,?,?,?)")
        .run("att-escape", "/etc/passwd", "text/plain", "passwd"); // outside the root
    return new AttachmentStreamer(db, root);
}

test("resolve returns the path for an attachment inside the root", () => {
    const root = tmpRoot();
    const file = path.join(root, "abc", "pic.png");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "PNGDATA");
    try {
        const loc = seed(root, file).resolve("att-ok");
        assert.ok(loc);
        assert.equal(loc!.path, file);
        assert.equal(loc!.mimeType, "image/png");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("resolve refuses a path outside the attachments root (traversal guard)", () => {
    const root = tmpRoot();
    try {
        assert.equal(seed(root, path.join(root, "x")).resolve("att-escape"), null);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("resolve returns null for an unknown guid or missing file", () => {
    const root = tmpRoot();
    try {
        const streamer = seed(root, path.join(root, "missing.png"));
        assert.equal(streamer.resolve("nope"), null);
        assert.equal(streamer.resolve("att-ok"), null); // file doesn't exist
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("the download route streams bytes with auth, 401 without, 404 unknown", async () => {
    const root = tmpRoot();
    const file = path.join(root, "pic.png");
    fs.writeFileSync(file, "PNGBYTES");
    const app = Fastify();
    mountAttachmentRoutes(app, { streamer: seed(root, file), auth: { password: "pw" } });
    try {
        assert.equal((await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download" })).statusCode, 401);

        const ok = await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download?password=pw" });
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body, "PNGBYTES");
        assert.match(ok.headers["content-type"] as string, /image\/png/);

        const missing = await app.inject({ method: "GET", url: "/api/v1/attachment/nope/download?password=pw" });
        assert.equal(missing.statusCode, 404);
    } finally {
        await app.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
