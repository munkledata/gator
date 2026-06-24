/**
 * Recover plain text from an Apple `typedstream`-encoded NSAttributedString blob
 * (chat.db `message.attributedBody`).
 *
 * Why this exists: an EDITED iMessage stores its latest text ONLY in `attributedBody` — the
 * plain `text` column goes empty. Without decoding it, edited messages serialize with no body and
 * render blank on clients. (Verified against this Mac's chat.db: 486/486 edited messages decode.)
 *
 * Format: after the `NSString` class name comes a `+` (0x2B) type marker, a typedstream
 * variable-length count, then the UTF-8 bytes. The count is a single byte when < 0x80, else
 * 0x81 → uint16-LE, 0x82 → uint32-LE. Best-effort and total — returns null on anything that
 * doesn't look like a streamtyped string rather than throwing.
 */
export function attributedBodyText(blob: unknown): string | null {
    if (!Buffer.isBuffer(blob) || blob.length < 16) return null;
    if (!blob.subarray(0, 16).toString("latin1").includes("streamtyped")) return null;

    const marker = blob.indexOf("NSString", 0, "latin1");
    if (marker < 0) return null;

    // The text's '+' type marker sits a few bytes past the class name.
    let plus = -1;
    for (let i = marker + 8; i < Math.min(marker + 8 + 16, blob.length); i++) {
        if (blob[i] === 0x2b) {
            plus = i;
            break;
        }
    }
    if (plus < 0) return null;

    let p = plus + 1;
    const lead = blob.readInt8(p);
    p += 1;
    let len: number;
    if (lead === -127) {
        // 0x81 → uint16-LE count
        if (p + 2 > blob.length) return null;
        len = blob.readUInt16LE(p);
        p += 2;
    } else if (lead === -126) {
        // 0x82 → uint32-LE count
        if (p + 4 > blob.length) return null;
        len = blob.readUInt32LE(p);
        p += 4;
    } else if (lead >= 0) {
        len = lead;
    } else {
        return null;
    }
    if (len <= 0 || p + len > blob.length) return null;

    // U+FFFC is the inline-attachment placeholder, not real text — strip it so an attachment-only
    // message doesn't decode to a lone glyph.
    const text = blob.subarray(p, p + len).toString("utf8").replace(/￼/g, "");
    return text.length > 0 ? text : null;
}
