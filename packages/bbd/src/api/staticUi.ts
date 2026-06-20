import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { setSecurityHeaders } from "./securityHeaders";

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf"
};

/**
 * Serves a built single-page UI bundle from `dir`. The API routes (`/api/*`,
 * `/socket.io`) are registered first and take precedence over this wildcard, so this
 * only handles the rest: a real asset if one exists under `dir` (path-traversal
 * guarded), otherwise `index.html` for client-side routing. No extra dependency —
 * just `node:fs` — which keeps the bundle the Electron shell forks lean.
 */
export function serveStaticUi(app: FastifyInstance, dir: string): void {
    const root = path.resolve(dir);
    const indexHtml = path.join(root, "index.html");

    app.get("/*", async (req, reply) => {
        const urlPath = decodeURIComponent((req.url.split("?")[0] ?? "/"));
        if (urlPath.startsWith("/api/") || urlPath.startsWith("/socket.io")) {
            return reply.callNotFound();
        }
        const resolved = path.resolve(root, "." + urlPath);
        const isFile = resolved.startsWith(root + path.sep) && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
        const file = isFile ? resolved : indexHtml;
        if (!fs.existsSync(file)) return reply.code(404).type("text/plain").send("Not found");
        const contentType = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
        reply.header("Content-Type", contentType);
        // The CSP/anti-framing headers belong on the HTML document (audit S9).
        if (contentType.startsWith("text/html")) setSecurityHeaders(reply);
        return reply.send(fs.createReadStream(file));
    });
}
