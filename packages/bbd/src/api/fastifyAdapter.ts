import type { FastifyInstance, FastifyRequest } from "fastify";
import type { OperationRegistry } from "./registry";
import { executeOperation, type AuthConfig } from "./execute";
import type { Logger } from "../core/logger";

export interface FastifyAdapterDeps {
    logger: Logger;
    auth: AuthConfig;
}

function extractCredential(request: FastifyRequest): string | undefined {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const fromQuery = q["password"] ?? q["guid"] ?? q["token"];
    if (typeof fromQuery === "string") return fromQuery;
    const authz = request.headers["authorization"];
    if (typeof authz === "string" && authz.startsWith("Bearer ")) return authz.slice(7);
    return undefined;
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
                    { input, credential: extractCredential(request), rateLimitKey: request.ip },
                    { logger: deps.logger },
                    deps.auth
                );
                await reply.status(envelope.status).send(envelope);
            }
        });
    }
}
