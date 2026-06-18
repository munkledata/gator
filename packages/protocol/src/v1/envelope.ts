/**
 * BlueBubbles v1 wire envelope — **FROZEN**.
 *
 * Every REST (`/api/v1`) and Socket.IO response a client receives is shaped by
 * `ResponseFormat`. Thousands of deployed Android/iOS/desktop/web clients parse
 * these fields by name, so this contract must remain byte-compatible forever.
 *
 * This file is the single typed source of truth for that contract. New, additive
 * fields (e.g. a v2 capability object) are allowed; renames/removals are not.
 */

/** HTTP-style status codes the server is allowed to emit on the wire. */
export type ValidStatus = 200 | 201 | 400 | 401 | 403 | 404 | 500;

/** Human-readable status strings paired with {@link ValidStatus}. */
export enum ResponseMessage {
    SUCCESS = "Success",
    CREATED = "Created",
    BAD_REQUEST = "Bad Request",
    SERVER_ERROR = "Server Error",
    UNAUTHORIZED = "Unauthorized",
    FORBIDDEN = "Forbidden",
    NOT_FOUND = "Not Found",
    NO_DATA = "No Data"
}

/** Optional structured error block returned alongside a non-2xx status. */
export interface ResponseError {
    type?: string;
    message: string;
}

/**
 * The container every response is wrapped in.
 *
 * @typeParam T - the shape of `data` for this particular endpoint.
 */
export interface ResponseFormat<T = unknown> {
    status: ValidStatus;
    message: ResponseMessage | string;
    error?: ResponseError;
    data?: T | null;
    /** Present on paginated list endpoints. */
    metadata?: ResponseMetadata;
}

/** Pagination/economy metadata attached to list responses. */
export interface ResponseMetadata {
    offset?: number;
    limit?: number;
    total?: number;
    count?: number;
}

/** Convenience constructor for a success envelope. Keeps the frozen shape in one place. */
export function success<T>(data: T, message: string = ResponseMessage.SUCCESS): ResponseFormat<T> {
    return { status: 200, message, data };
}

/** Convenience constructor for an error envelope. */
export function failure(
    status: Exclude<ValidStatus, 200 | 201>,
    message: string,
    error?: ResponseError
): ResponseFormat<never> {
    return { status, message, error };
}
