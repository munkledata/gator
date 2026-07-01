import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Logger } from "../core/logger";

const execFileAsync = promisify(execFile);

/**
 * Best-effort: exclude the userData directory (config.db + WAL/SHM sidecars + certs) from Time
 * Machine / local snapshots via `tmutil addexclusion` (audit F18). `config.db` is chmod 0600 but
 * NOT encrypted at rest, and it holds the server password + any non-vaulted config; a Time
 * Machine / iCloud backup copies those bytes into backup media where the 0600 owner-only
 * protection no longer applies. Excluding the directory keeps them out of the backup.
 *
 * macOS-only; a non-sticky path exclusion (no root needed for the current user's own paths) and
 * idempotent (re-adding an existing exclusion is a no-op). Any failure is logged, never fatal —
 * a missing/older tmutil or a sandboxed path must not block boot.
 */
export async function excludeFromBackups(dir: string, logger: Logger): Promise<void> {
    if (os.platform() !== "darwin") return;
    try {
        await execFileAsync("tmutil", ["addexclusion", dir]);
        logger.debug(`excluded ${dir} from Time Machine backups`);
    } catch (e) {
        logger.warn(`could not exclude ${dir} from Time Machine (non-fatal): ${(e as Error)?.message ?? e}`);
    }
}
