/**
 * Length-prefixed framing for the helper transport.
 *
 * The legacy protocol is newline-delimited JSON with a `[...new Set(...)]` per-chunk
 * de-dup and an ad-hoc `}\n{` split — which silently drops events on partial frames.
 * A u32-LE length prefix + a stateful decoder that buffers partial frames removes
 * that entire class of bug.
 */

const LENGTH_BYTES = 4;

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
