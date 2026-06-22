import type { Server, Socket } from "socket.io";
import type { OperationRegistry } from "./registry";
import { executeOperation, type AuthConfig } from "./execute";
import { isTrustedLocal, checkPasswordAuth } from "./auth";
import type { Logger } from "../core/logger";

export interface SocketAdapterDeps {
    logger: Logger;
    auth: AuthConfig;
}

/**
 * Authenticated sockets join this room; all server-push broadcasts target it, so an
 * unauthenticated connection can never receive message DTOs, logs, or config events
 * (audit S6).
 */
export const AUTHED_ROOM = "authed";

function extractCredential(socket: Socket, data: unknown): string | undefined {
    const a = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const fromAuth = a["password"] ?? a["token"] ?? a["guid"];
    if (typeof fromAuth === "string") return fromAuth;
    const q = (socket.handshake.query ?? {}) as Record<string, unknown>;
    const fromHandshake = q["password"] ?? q["guid"] ?? q["token"];
    if (typeof fromHandshake === "string") return fromHandshake;
    if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const fromData = d["password"] ?? d["guid"] ?? d["token"];
        if (typeof fromData === "string") return fromData;
    }
    return undefined;
}

/** The local-trust token a socket presents (handshake auth/query/header). */
function extractLocalToken(socket: Socket): string | undefined {
    const a = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    if (typeof a["localAuth"] === "string") return a["localAuth"];
    const q = (socket.handshake.query ?? {}) as Record<string, unknown>;
    if (typeof q["localAuth"] === "string") return q["localAuth"];
    const h = (socket.handshake.headers ?? {})["x-bbd-local-auth"];
    return typeof h === "string" ? h : undefined;
}

/**
 * Mount every operation as a Socket.IO handler (event = `op.socketEvent ?? op.name`).
 *
 * Unlike the legacy adapter, the connection itself is authenticated **at handshake**:
 * a socket that presents neither the local token nor the password is disconnected
 * immediately (audit S6), so it never joins the broadcast room and never receives a
 * pushed event. Once authenticated, the connection is trusted for its events (the
 * shared {@link executeOperation} still re-checks per call as defense in depth) and a
 * request over the socket produces a byte-identical v1 envelope to the same request
 * over REST.
 */
export function mountSocket(io: Server, registry: OperationRegistry, deps: SocketAdapterDeps): void {
    io.on("connection", (socket: Socket) => {
        const localToken = extractLocalToken(socket);
        const credential = extractCredential(socket, undefined);
        const trusted = isTrustedLocal(localToken, deps.auth.localToken);

        // The handshake is a password surface, so it must enforce the SAME brute-force lockout
        // as the REST/operation path (audit F8) — otherwise an attacker can hammer passwords by
        // opening sockets. Route through the shared helper keyed on the handshake address: a
        // locked key is rejected, a mismatch records a failure, a success resets the counter.
        if (!trusted) {
            const result = checkPasswordAuth(
                credential,
                deps.auth.password,
                socket.handshake.address,
                deps.auth.rateLimiter
            );
            if (result !== "ok") {
                const reason = result === "locked" ? "too many failed attempts" : "authentication required";
                deps.logger.debug(
                    `rejecting socket ${socket.id} from ${socket.handshake.address} (${result})`
                );
                socket.emit("unauthorized", { message: reason });
                socket.disconnect(true);
                return;
            }
        }
        void socket.join(AUTHED_ROOM);

        for (const op of registry.all()) {
            const event = op.socketEvent ?? op.name;
            socket.on(event, async (data: unknown, ack?: (response: unknown) => void) => {
                const envelope = await executeOperation(
                    op,
                    {
                        input: data ?? {},
                        credential: extractCredential(socket, data),
                        rateLimitKey: socket.handshake.address,
                        // The connection was authenticated at handshake.
                        trusted: true
                    },
                    { logger: deps.logger },
                    deps.auth
                );
                ack?.(envelope);
            });
        }
    });
}
