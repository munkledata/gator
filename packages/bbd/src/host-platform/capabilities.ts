/**
 * The single source of truth for macOS version and feature gating.
 *
 * The legacy codebase scatters 65+ `isMinBigSur` / `isMinVentura` / `isMin*`
 * checks across the server *and* hard-codes which features exist per OS. Here it
 * lives in exactly one place: detect the OS once, derive a {@link Capabilities}
 * record, and let everything else read flags off it. Adding support for a new
 * macOS release becomes a one-table edit.
 *
 * Note the split of concerns: *version* gating lives here, but whether the
 * private-API dylib can actually be injected is a SIP/runtime fact supplied by
 * the host-platform adapter (`injectionViable`), not something derivable from the
 * version number.
 */

import os from "node:os";

export interface MacOSVersion {
    /** macOS product major (11, 12, …, 15, 26). */
    major: number;
    minor: number;
    patch: number;
    /** Marketing name when known (e.g. "Tahoe"), else a sensible fallback. */
    name: string;
}

const MACOS_NAMES: Record<number, string> = {
    11: "Big Sur",
    12: "Monterey",
    13: "Ventura",
    14: "Sonoma",
    15: "Sequoia",
    26: "Tahoe"
};

/**
 * Map a Darwin kernel release string (e.g. `os.release()` → "25.5.0") to a macOS
 * product version. The Darwin→macOS *major* mapping is reliable; minor/patch are
 * best-effort and may be overridden with the real `sw_vers -productVersion` by
 * the host adapter when exactness matters.
 *
 * Apple jumped macOS 15 → 26 (Tahoe = Darwin 25), so this is a piecewise map, not
 * arithmetic.
 */
export function detectMacOSVersion(darwinRelease: string = os.release()): MacOSVersion {
    const parts = darwinRelease.split(".").map(n => parseInt(n, 10) || 0);
    const darwinMajor = parts[0] ?? 0;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;

    let major: number;
    let resolvedMinor = minor;
    if (darwinMajor >= 25) {
        // Tahoe era and later: macOS 26 = Darwin 25, then +1 thereafter.
        major = darwinMajor + 1;
    } else if (darwinMajor >= 20) {
        // Big Sur (20) … Sequoia (24).
        major = darwinMajor - 9;
    } else {
        // Legacy 10.x: Darwin 17→10.13, 18→10.14, 19→10.15.
        major = 10;
        resolvedMinor = darwinMajor - 4;
    }

    const name = MACOS_NAMES[major] ?? (major === 10 ? `10.${resolvedMinor}` : `macOS ${major}`);
    return { major, minor: major === 10 ? resolvedMinor : minor, patch, name };
}

export interface Capabilities {
    version: MacOSVersion;
    /** Whether the private-API dylib can be injected (SIP/runtime fact, supplied by the adapter). */
    injectionViable: boolean;

    // Feature gates, derived purely from the macOS major version.
    supportsReplies: boolean; // macOS 11+
    supportsGroupPhoto: boolean; // macOS 11+
    supportsPinnedChats: boolean; // macOS 11+
    supportsHandwritingPreview: boolean; // macOS 11+
    supportsFocusStatus: boolean; // macOS 12+
    supportsForceNotify: boolean; // macOS 12+
    supportsEditMessage: boolean; // macOS 13+
    supportsUnsendMessage: boolean; // macOS 13+
    supportsMarkUnread: boolean; // macOS 13+
}

export interface CapabilityInputs {
    version?: MacOSVersion;
    /** Defaults to false (SIP enabled ⇒ injection blocked) until the adapter proves otherwise. */
    injectionViable?: boolean;
}

/** Derive the full capability record. Pure given its inputs (great for tests). */
export function computeCapabilities(inputs: CapabilityInputs = {}): Capabilities {
    const version = inputs.version ?? detectMacOSVersion();
    const m = version.major;
    return {
        version,
        injectionViable: inputs.injectionViable ?? false,
        supportsReplies: m >= 11,
        supportsGroupPhoto: m >= 11,
        supportsPinnedChats: m >= 11,
        supportsHandwritingPreview: m >= 11,
        supportsFocusStatus: m >= 12,
        supportsForceNotify: m >= 12,
        supportsEditMessage: m >= 13,
        supportsUnsendMessage: m >= 13,
        supportsMarkUnread: m >= 13
    };
}
