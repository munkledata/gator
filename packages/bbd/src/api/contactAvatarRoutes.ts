import type { FastifyInstance } from "fastify";
import { failure, ResponseMessage } from "@bluebubbles/protocol";
import type { ContactsService, AvatarSize } from "../contacts/ContactsService";
import { checkPasswordAuth, isTrustedLocal } from "./auth";
import { extractCredential, extractLocalToken } from "./fastifyAdapter";
import type { AuthConfig } from "./execute";

export interface ContactAvatarRoutesDeps {
    contacts: ContactsService;
    auth: AuthConfig;
}

/** Sniff the image type from magic bytes (contact photos are JPEG/PNG); default JPEG. */
function imageMime(buf: Buffer): string {
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
    return "image/jpeg";
}

/**
 * Raw contact-avatar bytes — outside the JSON-envelope operation layer because the body is
 * binary (mirrors {@link file://./attachmentRoutes.ts}). Auth goes through the SAME shared
 * password+lockout helper the operations use, and an unauthorized/absent avatar collapses to
 * 404 so the route isn't a password oracle or a contact-id probe.
 */
export function mountContactAvatarRoutes(app: FastifyInstance, deps: ContactAvatarRoutesDeps): void {
    app.get("/api/v1/contact/:id/avatar", async (request, reply) => {
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
            if (result === "unauthorized") {
                return reply.status(404).send(failure(404, ResponseMessage.NOT_FOUND));
            }
        }

        const id = (request.params as { id: string }).id;
        const sizeParam = (request.query as { size?: string }).size;
        const size: AvatarSize = sizeParam === "full" ? "full" : "thumb";

        const bytes = await deps.contacts.getAvatar(id, size);
        if (!bytes) {
            return reply.status(404).send(failure(404, ResponseMessage.NOT_FOUND));
        }
        // Avatars are immutable for a given (id, photo); the client cache-busts via avatarEtag.
        reply.type(imageMime(bytes));
        reply.header("Cache-Control", "private, max-age=86400");
        return reply.send(bytes);
    });
}
