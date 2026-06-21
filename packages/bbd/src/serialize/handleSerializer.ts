import type { HandleV1 } from "@bluebubbles/protocol";

/**
 * The canonical wire shape lives in `@bluebubbles/protocol` (the frozen v1 contract).
 * Re-exported under the legacy name for back-compat; {@link serializeHandle} is
 * annotated to return it, so `tsc` enforces field-for-field conformance.
 */
export type { HandleV1 as HandleResponse } from "@bluebubbles/protocol";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function serializeHandle(row: Record<string, unknown>): HandleV1 {
    return {
        address: str(row["id"]) ?? "",
        country: str(row["country"]),
        uncanonicalizedId: str(row["uncanonicalized_id"]),
        service: str(row["service"])
    };
}
