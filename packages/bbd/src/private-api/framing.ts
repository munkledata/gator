/**
 * Length-prefixed framing for the helper transport.
 *
 * The legacy protocol is newline-delimited JSON with a `[...new Set(...)]` per-chunk
 * de-dup and an ad-hoc `}\n{` split — which silently drops events on partial frames.
 * A u32-LE length prefix + a stateful decoder that buffers partial frames removes
 * that entire class of bug.
 */

const LENGTH_BYTES = 4;

/**
 * Hard cap on a single frame. A malicious local peer could otherwise send a u32
 * length prefix up to ~4 GB and dribble bytes to force unbounded buffering (this
 * decoder buffers *before* the handshake runs). 16 MiB is far above any legitimate
 * private-API frame; an oversized length is treated as a protocol violation.
 */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

export class FrameTooLargeError extends Error {
    constructor(length: number) {
        super(`frame length ${length} exceeds MAX_FRAME_BYTES (${MAX_FRAME_BYTES})`);
        this.name = "FrameTooLargeError";
    }
}

export function encodeFrame(value: unknown): Buffer {
    const payload = Buffer.from(JSON.stringify(value), "utf8");
    const header = Buffer.allocUnsafe(LENGTH_BYTES);
    header.writeUInt32LE(payload.length, 0);
    return Buffer.concat([header, payload]);
}

/**
 * Accumulates bytes and yields complete frames. A frame split across multiple
 * `push()` calls is buffered until whole; multiple frames in one chunk all emit.
 */
export class FrameDecoder {
    #buffer: Buffer = Buffer.alloc(0);

    push(chunk: Buffer): unknown[] {
        this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
        const out: unknown[] = [];
        while (this.#buffer.length >= LENGTH_BYTES) {
            const length = this.#buffer.readUInt32LE(0);
            if (length > MAX_FRAME_BYTES) {
                // Hostile/garbage length — drop the buffer and signal a protocol violation.
                this.#buffer = Buffer.alloc(0);
                throw new FrameTooLargeError(length);
            }
            if (this.#buffer.length < LENGTH_BYTES + length) break; // partial frame — wait
            const payload = this.#buffer.subarray(LENGTH_BYTES, LENGTH_BYTES + length);
            this.#buffer = this.#buffer.subarray(LENGTH_BYTES + length);
            try {
                out.push(JSON.parse(payload.toString("utf8")));
            } catch {
                // A malformed frame is dropped rather than wedging the stream.
            }
        }
        return out;
    }

    get buffered(): number {
        return this.#buffer.length;
    }
}
