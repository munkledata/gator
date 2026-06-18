import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { failure, ResponseMessage } from "@bluebubbles/protocol";
import type { AttachmentStreamer } from "../data/imessage/AttachmentStreamer";
import { safeEqual } from "./auth";
import { extractCredential } from "./fastifyAdapter";
import type { AuthConfig } from "./execute";

export interface AttachmentRoutesDeps {
    streamer: AttachmentStreamer;
    auth: AuthConfig;
}

/**
 * Binary attachment streaming — outside the JSON-envelope operation layer because
 * the body is raw bytes. Auth uses the same constant-time check as the operations;
 * the file is streamed (not buffered), and the streamer enforces the path-traversal
 * guard before we ever open it.
 */
export function mountAttachmentRoutes(app: FastifyInstance, deps: AttachmentRoutesDeps): void {
    app.get("/api/v1/attachment/:guid/download", async (request, reply) => {
        const credential = extractCredential(request);
        const authed =
            credential != null && deps.auth.password.length > 0 && safeEqual(credential, deps.auth.password);
        if (!authed) {
            return reply.status(401).send(failure(401, ResponseMessage.UNAUTHORIZED));
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
