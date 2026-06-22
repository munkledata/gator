import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AttachmentStreamer } from "../src/data/imessage/AttachmentStreamer";
import { mountAttachmentRoutes } from "../src/api/attachmentRoutes";
import { RateLimiter } from "../src/api/auth";

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
        // The streamer now returns the realpath-canonicalized location (it streams the
        // symlink-resolved real file, never the lexical path), so compare against realpath.
        assert.equal(loc!.path, fs.realpathSync(file));
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

test("resolve refuses a symlink inside the root that points outside it (audit F23)", () => {
    const root = tmpRoot();
    const outsideDir = tmpRoot(); // a sibling temp dir, NOT under root
    const secret = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(secret, "TOPSECRET");
    // A symlink that lives INSIDE the root but whose target escapes it. A lexical guard
    // (the path "inside.png" is under root) would pass; the realpath guard must reject.
    const link = path.join(root, "inside.png");
    fs.symlinkSync(secret, link);
    try {
        const db = new Database(":memory:");
        db.exec(
            "CREATE TABLE attachment(ROWID INTEGER PRIMARY KEY, guid TEXT, filename TEXT, mime_type TEXT, transfer_name TEXT)"
        );
        db.prepare("INSERT INTO attachment(guid, filename, mime_type, transfer_name) VALUES (?,?,?,?)").run(
            "att-symlink",
            link,
            "image/png",
            "inside.png"
        );
        const streamer = new AttachmentStreamer(db, root);
        assert.equal(streamer.resolve("att-symlink"), null, "symlink target outside the root is refused");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outsideDir, { recursive: true, force: true });
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

test("the download route streams bytes with auth, 404 without (no oracle), 404 unknown", async () => {
    const root = tmpRoot();
    const file = path.join(root, "pic.png");
    fs.writeFileSync(file, "PNGBYTES");
    const app = Fastify();
    mountAttachmentRoutes(app, { streamer: seed(root, file), auth: { password: "pw" } });
    try {
        // Unauthenticated now returns 404 (not 401) so the route is NOT a password oracle —
        // indistinguishable from a missing attachment (audit F8).
        const unauth = await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download" });
        assert.equal(unauth.statusCode, 404);

        const ok = await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download?password=pw" });
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body, "PNGBYTES");
        assert.match(ok.headers["content-type"] as string, /image\/png/);

        // A wrong password and an unknown guid are INDISTINGUISHABLE (both 404).
        const wrongPw = await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download?password=nope" });
        assert.equal(wrongPw.statusCode, 404);
        const missing = await app.inject({ method: "GET", url: "/api/v1/attachment/nope/download?password=pw" });
        assert.equal(missing.statusCode, 404);
    } finally {
        await app.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("the download route locks out after repeated bad passwords (audit F8)", async () => {
    const root = tmpRoot();
    const file = path.join(root, "pic.png");
    fs.writeFileSync(file, "PNGBYTES");
    const app = Fastify();
    const rateLimiter = new RateLimiter(3, 60_000);
    mountAttachmentRoutes(app, { streamer: seed(root, file), auth: { password: "pw", rateLimiter } });
    try {
        // Three bad attempts (404), then the key is locked → 403 even with the right password.
        for (let i = 0; i < 3; i++) {
            const r = await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download?password=bad" });
            assert.equal(r.statusCode, 404);
        }
        const locked = await app.inject({ method: "GET", url: "/api/v1/attachment/att-ok/download?password=pw" });
        assert.equal(locked.statusCode, 403, "locked out after too many failures");
    } finally {
        await app.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
