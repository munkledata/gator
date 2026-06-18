import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type DatabaseType from "better-sqlite3";

export interface AttachmentLocation {
    path: string;
    mimeType: string | null;
    transferName: string | null;
}

/**
 * Resolves an attachment GUID to its on-disk file path for streaming.
 *
 * Security: the path comes from `attachment.filename` in Apple's DB. Even though
 * that's normally trustworthy, we resolve it and require it to live **under the
 * Attachments root** — a path-traversal guard so a crafted/compromised chat.db can't
 * make the server stream arbitrary files (e.g. /etc/passwd).
 */
export class AttachmentStreamer {
    readonly #db: DatabaseType.Database;
    readonly #root: string;

    constructor(
        db: DatabaseType.Database,
        attachmentRoot: string = path.join(os.homedir(), "Library", "Messages", "Attachments")
    ) {
        this.#db = db;
        this.#root = path.resolve(attachmentRoot);
    }

    resolve(guid: string): AttachmentLocation | null {
        const row = this.#db
            .prepare("SELECT filename, mime_type, transfer_name FROM attachment WHERE guid = @guid LIMIT 1")
            .get({ guid }) as { filename?: unknown; mime_type?: unknown; transfer_name?: unknown } | undefined;
        if (!row || typeof row.filename !== "string" || row.filename.length === 0) return null;

        let filePath = row.filename;
        if (filePath.startsWith("~")) filePath = path.join(os.homedir(), filePath.slice(1));
        filePath = path.resolve(filePath);

        // Path-traversal guard: must be inside the attachments root.
        if (filePath !== this.#root && !filePath.startsWith(this.#root + path.sep)) return null;

        let stat: fs.Stats;
        try {
            stat = fs.statSync(filePath);
        } catch {
            return null;
        }
        if (!stat.isFile()) return null;

        return {
            path: filePath,
            mimeType: typeof row.mime_type === "string" ? row.mime_type : null,
            transferName: typeof row.transfer_name === "string" ? row.transfer_name : null
        };
    }
}
