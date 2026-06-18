import net from "node:net";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { HELPER_PROTOCOL_VERSION } from "@bluebubbles/protocol";
import type { Logger } from "../core/logger";
import { encodeFrame, FrameDecoder } from "./framing";
import { TransactionManager } from "./transactionManager";

export interface TransportRequest {
    action: string;
    data?: Record<string, unknown>;
}

export interface TransportResponse {
    data?: Record<string, unknown>;
    error?: string;
    /** The message GUID the dylib created — a real send ack. */
    identifier?: string;
}

export type EventHandler = (event: string, data: Record<string, unknown>) => void;

export interface PrivateApiTransport {
    send(request: TransportRequest, timeoutMs?: number): Promise<TransportResponse>;
    isConnected(): boolean;
    onEvent(handler: EventHandler): void;
    stop(): Promise<void>;
}

export interface FramedUdsTransportOptions {
    socketPath: string;
    /** Shared secret the dylib must present in its handshake. */
    secret: string;
    logger: Logger;
    defaultTimeoutMs?: number;
}

/**
 * The hardened replacement for the legacy `PrivateApiService`.
 *
 * A Unix-domain socket (0600) instead of a world-open localhost TCP port; a
 * shared-secret + version handshake before any action is accepted; length-prefixed
 * framing; a Map-based transaction manager. The dylib connects in, authenticates,
 * then exchanges length-prefixed JSON frames.
 */
export class FramedUdsTransport implements PrivateApiTransport {
    readonly #socketPath: string;
    readonly #secret: string;
    readonly #logger: Logger;
    readonly #txn: TransactionManager<TransportResponse>;
    readonly #eventHandlers: EventHandler[] = [];

    #server: net.Server | null = null;
    #client: net.Socket | null = null;
    #decoder = new FrameDecoder();
    #authed = false;

    constructor(opts: FramedUdsTransportOptions) {
        this.#socketPath = opts.socketPath;
        this.#secret = opts.secret;
        this.#logger = opts.logger.child({ component: "FramedUdsTransport" });
        this.#txn = new TransactionManager<TransportResponse>(opts.defaultTimeoutMs ?? 30_000);
    }

    async start(): Promise<void> {
        await fs.rm(this.#socketPath, { force: true });
        this.#server = net.createServer(sock => this.#onConnection(sock));
        await new Promise<void>((resolve, reject) => {
            this.#server!.once("error", reject);
            this.#server!.listen(this.#socketPath, () => resolve());
        });
        await fs.chmod(this.#socketPath, 0o600);
        this.#logger.info(`listening on ${this.#socketPath}`);
    }

    #onConnection(socket: net.Socket): void {
        this.#client = socket;
        this.#authed = false;
        this.#decoder = new FrameDecoder();
        socket.on("data", chunk => {
            for (const message of this.#decoder.push(chunk)) this.#handle(message as Record<string, unknown>);
        });
        socket.on("close", () => {
            this.#client = null;
            this.#authed = false;
            this.#txn.rejectAll(new Error("helper disconnected"));
        });
        socket.on("error", err => this.#logger.debug("socket error", err));
    }

    #handle(message: Record<string, unknown>): void {
        if (!this.#authed) {
            const ok = message["secret"] === this.#secret && Number(message["protocolVersion"]) >= HELPER_PROTOCOL_VERSION;
            if (!ok) {
                this.#logger.warn("rejecting helper: bad handshake");
                this.#client?.destroy();
                return;
            }
            this.#authed = true;
            this.#write({ event: "handshake-ok" });
            this.#logger.info("helper authenticated");
            return;
        }

        const transactionId = message["transactionId"];
        if (typeof transactionId === "string") {
            this.#txn.resolve(transactionId, {
                data: message["data"] as Record<string, unknown> | undefined,
                error: message["error"] as string | undefined,
                identifier: message["identifier"] as string | undefined
            });
            return;
        }

        const event = message["event"];
        if (typeof event === "string") {
            for (const handler of this.#eventHandlers) handler(event, (message["data"] as Record<string, unknown>) ?? {});
        }
    }

    #write(value: unknown): void {
        this.#client?.write(encodeFrame(value));
    }

    send(request: TransportRequest, timeoutMs?: number): Promise<TransportResponse> {
        if (!this.isConnected()) return Promise.reject(new Error("helper not connected"));
        const transactionId = randomUUID();
        const promise = this.#txn.create(transactionId, timeoutMs);
        this.#write({ transactionId, action: request.action, data: request.data ?? {} });
        return promise;
    }

    isConnected(): boolean {
        return this.#client != null && this.#authed;
    }

    onEvent(handler: EventHandler): void {
        this.#eventHandlers.push(handler);
    }

    async stop(): Promise<void> {
        this.#txn.rejectAll(new Error("transport stopping"));
        this.#client?.destroy();
        await new Promise<void>(resolve => {
            if (!this.#server) return resolve();
            this.#server.close(() => resolve());
        });
        await fs.rm(this.#socketPath, { force: true });
    }
}
