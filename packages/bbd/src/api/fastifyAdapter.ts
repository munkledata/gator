import type { FastifyInstance, FastifyRequest } from "fastify";
import type { OperationRegistry } from "./registry";
import { executeOperation, type AuthConfig } from "./execute";
import { isTrustedLocal } from "./auth";
import type { Logger } from "../core/logger";

export interface FastifyAdapterDeps {
    logger: Logger;
    auth: AuthConfig;
}

/** The header the local admin UI presents to prove it is the trusted shell renderer. */
export const LOCAL_AUTH_HEADER = "x-bbd-local-auth";

/** True for an exact loopback peer (used to keep the OAuth callback off the public iface). */
export function isLoopback(ip: string | undefined): boolean {
    if (!ip) return false;
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function extractCredential(request: FastifyRequest): string | undefined {
    // Prefer the Authorization header; query-string credentials leak via proxy/CDN
    // access logs, Referer, and browser history (audit S13), so they are the fallback.
    const authz = request.headers["authorization"];
    if (typeof authz === "string" && authz.startsWith("Bearer ")) return authz.slice(7);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const fromQuery = q["password"] ?? q["guid"] ?? q["token"];
    if (typeof fromQuery === "string") return fromQuery;
    return undefined;
}

/** The local-trust token a request presents (header only — never query/body). */
export function extractLocalToken(request: FastifyRequest): string | undefined {
    const h = request.headers[LOCAL_AUTH_HEADER];
    return typeof h === "string" ? h : undefined;
}

/**
 * Mount every operation as a Fastify route. The handler is a thin shim: gather the
 * credential + merged input, call the shared {@link executeOperation}, and send the
 * resulting v1 envelope with its status code. No business logic lives here.
 */
export function mountFastify(app: FastifyInstance, registry: OperationRegistry, deps: FastifyAdapterDeps): void {
    for (const op of registry.all()) {
        app.route({
            method: op.method,
            url: op.path,
            handler: async (request, reply) => {
                // Precedence: path params (trusted, from the route) win over query,
                // which wins over body — so a client can't override a route :id via body.
                const input = {
                    ...((request.body as object) ?? {}),
                    ...((request.query as object) ?? {}),
                    ...((request.params as object) ?? {})
                };
                const envelope = await executeOperation(
                    op,
                    {
                        input,
                        credential: extractCredential(request),
                        rateLimitKey: request.ip,
                        trusted: isTrustedLocal(extractLocalToken(request), deps.auth.localToken)
                    },
                    { logger: deps.logger },
                    deps.auth
                );
                await reply.status(envelope.status).send(envelope);
            }
        });
    }
}
