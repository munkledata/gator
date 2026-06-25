import os from "node:os";

/**
 * True on macOS 14.4 or newer — the release where Apple began encrypting the Find My caches and the
 * Private API helper stopped working for Find My. On 14.4+ we must read + decrypt the caches; below
 * it, the legacy plaintext-cache / Private-API paths still work.
 *
 * macOS 14.4 = Darwin 23.4 (for macOS N >= 11, Darwin major = N + 9). e.g. macOS 26 = Darwin 25.
 */
export function isMinSonoma14_4(): boolean {
    const parts = os.release().split(".").map((n) => parseInt(n, 10));
    const major = parts[0] ?? NaN;
    const minor = parts[1] ?? 0;
    if (!Number.isFinite(major)) return false;
    return major > 23 || (major === 23 && minor >= 4);
}
