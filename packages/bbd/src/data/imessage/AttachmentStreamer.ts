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
        // Canonicalize the root through realpath so the post-symlink containment check
        // below compares like-for-like (e.g. on macOS the temp/Messages dir may itself be a
        // symlink — /var -> /private/var — and a resolved file path would otherwise never
        // appear "under" a lexically-resolved root). Fall back to the lexical resolve if the
        // root doesn't exist yet (fresh machine before any attachment lands).
        const resolved = path.resolve(attachmentRoot);
        try {
            this.#root = fs.realpathSync(resolved);
        } catch {
            this.#root = resolved;
        }
    }

    resolve(guid: string): AttachmentLocation | null {
        const row = this.#db
            .prepare("SELECT filename, mime_type, transfer_name FROM attachment WHERE guid = @guid LIMIT 1")
            .get({ guid }) as { filename?: unknown; mime_type?: unknown; transfer_name?: unknown } | undefined;
        if (!row || typeof row.filename !== "string" || row.filename.length === 0) return null;

        let filePath = row.filename;
        if (filePath.startsWith("~")) filePath = path.join(os.homedir(), filePath.slice(1));
        filePath = path.resolve(filePath);

        // Path-traversal guard. A lexical `startsWith(root)` check is NOT enough: it constrains
        // only the path as written, but `statSync`/`createReadStream` follow symlinks, so a
        // symlink that lives inside the root yet points its target outside it would slip past a
        // lexical-only guard. Resolve the path through realpath (which collapses `..` AND follows
        // symlinks) and assert the REAL path is contained in the (also-canonical) root. realpathSync
        // throws on a missing file or a dangling symlink — treat that as not found.
        let real: string;
        try {
            real = fs.realpathSync(filePath);
        } catch {
            return null;
        }
        if (real !== this.#root && !real.startsWith(this.#root + path.sep)) return null;

        let stat: fs.Stats;
        try {
            stat = fs.statSync(real);
        } catch {
            return null;
        }
        if (!stat.isFile()) return null;

        return {
            path: real,
            mimeType: typeof row.mime_type === "string" ? row.mime_type : null,
            transferName: typeof row.transfer_name === "string" ? row.transfer_name : null
        };
    }
}
