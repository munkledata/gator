import type { Server, Socket } from "socket.io";
import type { OperationRegistry } from "./registry";
import { executeOperation, type AuthConfig } from "./execute";
import type { Logger } from "../core/logger";

export interface SocketAdapterDeps {
    logger: Logger;
    auth: AuthConfig;
}

function extractCredential(socket: Socket, data: unknown): string | undefined {
    const q = socket.handshake.query as Record<string, unknown>;
    const fromHandshake = q["password"] ?? q["guid"] ?? q["token"];
    if (typeof fromHandshake === "string") return fromHandshake;
    if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const fromData = d["password"] ?? d["guid"] ?? d["token"];
        if (typeof fromData === "string") return fromData;
    }
    return undefined;
}

/**
 * Mount every operation as a Socket.IO handler (event = `op.socketEvent ?? op.name`).
 * Like the Fastify adapter, this is a thin shim over the shared
 * {@link executeOperation}, so a request over the socket and the same request over
 * REST produce a byte-identical v1 envelope. `allowEIO3` is set by the caller when
 * constructing the Server, preserving legacy-client compatibility.
 */
export function mountSocket(io: Server, registry: OperationRegistry, deps: SocketAdapterDeps): void {
    io.on("connection", (socket: Socket) => {
        for (const op of registry.all()) {
            const event = op.socketEvent ?? op.name;
            socket.on(event, async (data: unknown, ack?: (response: unknown) => void) => {
                const envelope = await executeOperation(
                    op,
                    { input: data ?? {}, credential: extractCredential(socket, data), rateLimitKey: socket.handshake.address },
                    { logger: deps.logger },
                    deps.auth
                );
                ack?.(envelope);
            });
        }
    });
}
