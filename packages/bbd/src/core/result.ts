/**
 * Result<T, E> — an explicit success/failure value.
 *
 * The legacy server's startup is a linear `try/catch-and-continue` script that
 * swallows failures and leaves the process half-initialized with null fields.
 * Modeling fallible boundaries (DB open, socket bind, tunnel start, every Apple
 * call) as a `Result` instead forces callers to handle the failure path, and is
 * the building block the {@link Supervisor} uses to roll back a failed startup.
 */

export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

export interface Err<E> {
    readonly ok: false;
    readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Map the success value, passing an error through untouched. */
export const map = <T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
    r.ok ? ok(fn(r.value)) : r;

/** Map the error, passing a success through untouched. */
export const mapErr = <T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
    r.ok ? r : err(fn(r.error));

/** Unwrap the value or return a fallback. */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);

/** Run a throwing function and capture the outcome as a Result. */
export const attempt = <T>(fn: () => T): Result<T, Error> => {
    try {
        return ok(fn());
    } catch (e) {
        return err(toError(e));
    }
};

/** Async variant of {@link attempt}. */
export const attemptAsync = async <T>(fn: () => Promise<T>): Promise<Result<T, Error>> => {
    try {
        return ok(await fn());
    } catch (e) {
        return err(toError(e));
    }
};

/** Normalize an unknown thrown value into an Error. */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
