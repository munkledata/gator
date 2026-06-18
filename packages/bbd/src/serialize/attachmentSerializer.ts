/** v1 attachment DTO (metadata) — wire-compatible subset of the legacy AttachmentResponse. */
export interface AttachmentResponse {
    guid: string;
    uti: string | null;
    mimeType: string | null;
    transferName: string | null;
    totalBytes: number | null;
    isSticker: boolean;
    hideAttachment: boolean;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

export function serializeAttachment(row: Record<string, unknown>): AttachmentResponse {
    return {
        guid: str(row["guid"]) ?? "",
        uti: str(row["uti"]),
        mimeType: str(row["mime_type"]),
        transferName: str(row["transfer_name"]),
        totalBytes: numOrNull(row["total_bytes"]),
        isSticker: bool(row["is_sticker"]),
        hideAttachment: bool(row["hide_attachment"])
    };
}
