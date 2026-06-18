import { type ResponseFormat, success, failure, ResponseMessage } from "@bluebubbles/protocol";
import type { Operation, OperationContext } from "./Operation";
import { safeEqual, RateLimiter } from "./auth";

export interface AuthConfig {
    /** The configured shared password (the frozen v1 model). */
    password: string;
    rateLimiter?: RateLimiter;
}

export interface InvocationRequest {
    /** Raw input, already merged from query/params/body or the socket payload. */
    input: unknown;
    /** The credential the caller presented (password / token / guid). */
    credential?: string;
    /** Rate-limit key (e.g. client IP). */
    rateLimitKey?: string;
}

/**
 * The single execution path **both** transports call: auth → validate → handle →
 * envelope. Because the REST and socket adapters route through here, an operation's
 * behavior, validation, error mapping, and the v1 response envelope are guaranteed
 * identical across both surfaces — which is the whole point of Phase 4.
 */
export async function executeOperation<I, O>(
    op: Operation<I, O>,
    req: InvocationRequest,
    ctx: Omit<OperationContext, "credential">,
    auth: AuthConfig
): Promise<ResponseFormat<O>> {
    // 1. Auth (frozen v1 shared-password model, now constant-time + rate-limited).
    if (op.auth) {
        const key = req.rateLimitKey ?? "global";
        if (auth.rateLimiter?.isLocked(key)) {
            return failure(403, ResponseMessage.FORBIDDEN, { type: "rate_limit", message: "too many failed attempts" });
        }
        const authed = req.credential != null && auth.password.length > 0 && safeEqual(req.credential, auth.password);
        if (!authed) {
            auth.rateLimiter?.recordFailure(key);
            return failure(401, ResponseMessage.UNAUTHORIZED);
        }
        auth.rateLimiter?.reset(key);
    }

    // 2. Validate.
    const parsed = op.input.safeParse(req.input);
    if (!parsed.success) {
        return failure(400, ResponseMessage.BAD_REQUEST, { type: "validation", message: parsed.error.message });
    }

    // 3. Handle.
    try {
        const data = await op.handler({ ...ctx, credential: req.credential }, parsed.data);
        return success(data);
    } catch (e) {
        ctx.logger.error(`operation "${op.name}" failed`, e);
        return failure(500, ResponseMessage.SERVER_ERROR, { message: e instanceof Error ? e.message : String(e) });
    }
}
