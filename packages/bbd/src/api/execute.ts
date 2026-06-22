import { type ResponseFormat, success, failure, ResponseMessage } from "@bluebubbles/protocol";
import type { Operation, OperationContext } from "./Operation";
import { checkPasswordAuth, RateLimiter } from "./auth";

/**
 * Thrown by a channel-multiplexing dispatcher (admin-command) when a destructive sub-command
 * is invoked without the trusted LOCAL channel (audit F15). {@link executeOperation} maps it to
 * a 403 envelope — not the generic 500 a normal handler throw produces — so per-channel
 * admin gating behaves exactly like the op-level `adminOnly` flag.
 */
export class AdminOnlyError extends Error {
    constructor(message = "admin operation requires local access") {
        super(message);
        this.name = "AdminOnlyError";
    }
}

export interface AuthConfig {
    /** The configured shared password (the frozen v1 model). */
    password: string;
    /**
     * Per-boot secret that marks the local admin UI as trusted (password-free). Set by
     * the Electron shell and presented by its renderer; never derived from the source
     * IP (see {@link file://./auth.ts} `isTrustedLocal`). Undefined in headless runs,
     * where every caller must use the password.
     */
    localToken?: string;
    rateLimiter?: RateLimiter;
}

export interface InvocationRequest {
    /** Raw input, already merged from query/params/body or the socket payload. */
    input: unknown;
    /** The credential the caller presented (password / token / guid). */
    credential?: string;
    /** Rate-limit key (e.g. client IP). */
    rateLimitKey?: string;
    /**
     * The caller is the trusted local admin UI (it presented the per-boot local token,
     * not merely a loopback IP — see {@link file://./auth.ts} `isTrustedLocal`). Trusted
     * callers skip the password; the password still guards every remote request.
     */
    trusted?: boolean;
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
    // Routes through the SAME shared password+lockout helper every password surface uses
    // (audit F8), so behavior is identical across REST/socket/attachment paths.
    if (op.auth && !req.trusted) {
        const key = req.rateLimitKey ?? "global";
        const result = checkPasswordAuth(req.credential, auth.password, key, auth.rateLimiter);
        if (result === "locked") {
            return failure(403, ResponseMessage.FORBIDDEN, { type: "rate_limit", message: "too many failed attempts" });
        }
        if (result === "unauthorized") {
            return failure(401, ResponseMessage.UNAUTHORIZED);
        }
    }

    // 1b. Admin-only ops require the trusted LOCAL channel (the per-boot local token), never
    // the shared password — even a correct password is rejected (audit F15). Destructive
    // local-admin surfaces are off-limits to remote password-authenticated clients.
    if (op.adminOnly && !req.trusted) {
        return failure(403, ResponseMessage.FORBIDDEN, { type: "admin_only", message: "admin operation requires local access" });
    }

    // 2. Validate.
    const parsed = op.input.safeParse(req.input);
    if (!parsed.success) {
        return failure(400, ResponseMessage.BAD_REQUEST, { type: "validation", message: parsed.error.message });
    }

    // 3. Handle. Forward `trusted` so a channel-multiplexing dispatcher (admin-command) can
    // gate destructive sub-commands to the local channel per-channel (audit F15).
    try {
        const data = await op.handler({ ...ctx, credential: req.credential, trusted: req.trusted }, parsed.data);
        return success(data);
    } catch (e) {
        // A per-channel admin denial maps to 403 (not 500), matching the op-level adminOnly flag.
        if (e instanceof AdminOnlyError) {
            return failure(403, ResponseMessage.FORBIDDEN, { type: "admin_only", message: e.message });
        }
        ctx.logger.error(`operation "${op.name}" failed`, e);
        return failure(500, ResponseMessage.SERVER_ERROR, { message: e instanceof Error ? e.message : String(e) });
    }
}
