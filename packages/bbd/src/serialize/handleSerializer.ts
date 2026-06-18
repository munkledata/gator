/** v1 handle DTO — wire-compatible with the legacy HandleResponse. */
export interface HandleResponse {
    address: string;
    country: string | null;
    uncanonicalizedId: string | null;
    service: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function serializeHandle(row: Record<string, unknown>): HandleResponse {
    return {
        address: str(row["id"]) ?? "",
        country: str(row["country"]),
        uncanonicalizedId: str(row["uncanonicalized_id"]),
        service: str(row["service"])
    };
}
