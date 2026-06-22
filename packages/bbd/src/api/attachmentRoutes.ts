import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { failure, ResponseMessage } from "@bluebubbles/protocol";
import type { AttachmentStreamer } from "../data/imessage/AttachmentStreamer";
import { checkPasswordAuth, isTrustedLocal } from "./auth";
import { extractCredential, extractLocalToken } from "./fastifyAdapter";
import type { AuthConfig } from "./execute";

export interface AttachmentRoutesDeps {
    streamer: AttachmentStreamer;
    auth: AuthConfig;
}

/**
 * Binary attachment streaming — outside the JSON-envelope operation layer because
 * the body is raw bytes. Auth routes through the SAME shared password+lockout helper
 * the operations use (audit F8), so this route is brute-force-throttled too; the file
 * is streamed (not buffered), and the streamer enforces the path-traversal guard
 * before we ever open it.
 */
export function mountAttachmentRoutes(app: FastifyInstance, deps: AttachmentRoutesDeps): void {
    app.get("/api/v1/attachment/:guid/download", async (request, reply) => {
        // The trusted local UI (x-bbd-local-auth) skips the password, like the operations.
        const trusted = isTrustedLocal(extractLocalToken(request), deps.auth.localToken);
        if (!trusted) {
            const result = checkPasswordAuth(
                extractCredential(request),
                deps.auth.password,
                request.ip,
                deps.auth.rateLimiter
            );
            if (result === "locked") {
                return reply
                    .status(403)
                    .send(failure(403, ResponseMessage.FORBIDDEN, { type: "rate_limit", message: "too many failed attempts" }));
            }
            // Collapse the unauthorized case into 404 (same as a missing attachment) so this
            // route is NOT a password oracle: an attacker can't distinguish "wrong password"
            // (401) from "no such attachment" (404) and probe for valid guids (audit F8).
            if (result === "unauthorized") {
                return reply.status(404).send(failure(404, ResponseMessage.NOT_FOUND));
            }
        }

        const guid = (request.params as { guid: string }).guid;
        const location = deps.streamer.resolve(guid);
        if (!location) {
            return reply.status(404).send(failure(404, ResponseMessage.NOT_FOUND));
        }

        if (location.mimeType) reply.type(location.mimeType);
        if (location.transferName) {
            reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(location.transferName)}"`);
        }
        return reply.send(fs.createReadStream(location.path));
    });
}
