import type { FastifyReply } from "fastify";

/**
 * Security response headers for the HTML the daemon serves (the admin SPA and the
 * OAuth callback page). Upstream loaded the UI from `file://`; the fork serves it over
 * HTTP, so a Content-Security-Policy is the replacement integrity control (audit S9).
 *
 * The policy is tight: scripts only from our own origin (no inline/eval), styles allow
 * inline because Emotion/Mantine inject `<style>` at runtime, connections only to the
 * same origin (covers the Socket.IO websocket in Chromium/Electron), and the page may
 * not be framed.
 */
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
].join("; ");

export function setSecurityHeaders(reply: FastifyReply): void {
    reply.header("Content-Security-Policy", CSP);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
}
