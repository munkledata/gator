import type { AttachmentV1 } from "@bluebubbles/protocol";

/**
 * The canonical wire shape lives in `@bluebubbles/protocol` (the frozen v1 contract).
 * Re-exported under the legacy name for back-compat; {@link serializeAttachment} is
 * annotated to return it, so `tsc` enforces field-for-field conformance.
 */
export type { AttachmentV1 as AttachmentResponse } from "@bluebubbles/protocol";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === 1 || v === true;

export function serializeAttachment(row: Record<string, unknown>): AttachmentV1 {
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
