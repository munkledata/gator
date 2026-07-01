import { z } from "zod";

/**
 * Structural validation for live events pushed by the macOS BlueBubbles-helper dylib
 * (typing / read-status / group / incoming-facetime / …). The helper is a semi-trusted peer
 * (chmod-0600 UDS + handshake secret), but its frames were previously forwarded to every authed
 * socket AND to outbound webhook targets with only a `data as Record<string, unknown>` cast —
 * so a malformed or malicious frame (non-object `data`, empty event) propagated unvalidated.
 *
 * This validates the ENVELOPE only: a non-empty event name and an object `data` (unknown fields
 * pass through). We intentionally do NOT guess per-event field schemas — the dylib's exact
 * payload contract lives outside this repo, and an over-strict schema would silently DROP valid
 * events. Per-event field validation can be layered on once that contract is pinned. A frame
 * that fails this check is dropped (fail-closed) rather than relayed.
 */
const HelperEnvelope = z.object({
    event: z.string().min(1),
    // A plain object; rejects a primitive/array/null `data` that the runtime cast would let slip.
    data: z.record(z.string(), z.unknown())
});

/** Returns the validated data object, or null if the frame is structurally malformed (drop it). */
export function parseHelperEvent(event: string, data: unknown): Record<string, unknown> | null {
    const r = HelperEnvelope.safeParse({ event, data });
    return r.success ? r.data.data : null;
}
