import type { ZodType } from "zod";
import type { Logger } from "../core/logger";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * What an operation handler receives. The services a handler needs are closed over
 * at definition time (see buildCoreOperations), not reached out of a global — so an
 * operation is a pure function of (ctx, input).
 */
export interface OperationContext {
    logger: Logger;
    /** The credential the caller presented; auth has already been enforced. */
    credential?: string;
}

/**
 * A transport-agnostic server operation — defined **once** and exposed on both the
 * REST (Fastify) and Socket.IO surfaces. This is the antidote to the legacy dual
 * surface, where `httpRoutes.ts` and `socketRoutes.ts` reimplemented overlapping
 * operations with divergent params, two response systems, and two validators.
 */
export interface Operation<I = unknown, O = unknown> {
    /** Stable name; also the default Socket.IO event. */
    readonly name: string;
    readonly method: HttpMethod;
    /** REST path, e.g. "/api/v1/ping" (":id" style params allowed). */
    readonly path: string;
    /** Override the Socket.IO event name (defaults to `name`). */
    readonly socketEvent?: string;
    /** Whether the password/token is required. */
    readonly auth: boolean;
    /** Input validation. Use a permissive object schema for "no input". */
    readonly input: ZodType<I>;
    /** The single implementation, shared by both transports. */
    readonly handler: (ctx: OperationContext, input: I) => Promise<O> | O;
    readonly summary?: string;
}

/**
 * Define an operation. Input/output types are inferred locally (so the handler's
 * `input` is typed from the Zod schema), but the result is **type-erased** to
 * `Operation` so heterogeneous operations can live in one registry/array without
 * the handler's contravariant input type fighting the collection.
 */
export function defineOperation<I, O>(op: Operation<I, O>): Operation {
    return op as unknown as Operation;
}
