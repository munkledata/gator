/**
 * The one place every Apple chat.db magic number lives.
 *
 * The legacy server scatters these constants (reaction codes, item types, the
 * Cocoa epoch, chat styles) across transformers and inline checks. Centralizing
 * them — and committing fixtures that pin them against the per-OS sample schemas —
 * is what lets the rest of the read path stay declarative.
 */

/** 2001-01-01T00:00:00Z in Unix milliseconds. A compile-time UTC constant — the
 *  legacy code derived this from a parsed locale string, which is locale-fragile. */
export const COCOA_EPOCH_UNIX_MS = 978_307_200_000;

/**
 * Convert an Apple chat.db date to Unix milliseconds.
 *
 * Dates are nanoseconds-since-2001 on macOS 10.13+ (every currently-supported
 * release) and seconds-since-2001 on 10.12 and earlier. `auto` distinguishes them
 * by magnitude: a nanosecond value for any plausible date dwarfs 1e11, a second
 * value is far below it. Returns null for the 0/absent sentinel.
 */
export function appleDateToUnixMs(
    value: number | null | undefined,
    mode: "auto" | "nanoseconds" | "seconds" = "auto"
): number | null {
    if (value == null || value === 0) return null;
    const useNanos = mode === "nanoseconds" || (mode === "auto" && Math.abs(value) > 1e11);
    return useNanos ? value / 1e6 + COCOA_EPOCH_UNIX_MS : value * 1000 + COCOA_EPOCH_UNIX_MS;
}

/** Inverse of {@link appleDateToUnixMs} (always emits nanoseconds, for modern macOS). */
export function unixMsToAppleNanos(unixMs: number): number {
    return Math.round((unixMs - COCOA_EPOCH_UNIX_MS) * 1e6);
}

/** associated_message_type → reaction name. 2000–2005 add, 3000–3005 remove;
 *  2006/3006 sticker, 2007/3007 emoji (macOS 14+). */
export const REACTION_TYPES: Readonly<Record<number, string>> = {
    2000: "love",
    2001: "like",
    2002: "dislike",
    2003: "laugh",
    2004: "emphasize",
    2005: "question",
    2006: "sticker",
    2007: "emoji",
    3000: "-love",
    3001: "-like",
    3002: "-dislike",
    3003: "-laugh",
    3004: "-emphasize",
    3005: "-question",
    3006: "-sticker",
    3007: "-emoji"
};

export function isReaction(associatedMessageType: number | null | undefined): boolean {
    return associatedMessageType != null && associatedMessageType >= 2000 && associatedMessageType <= 3007;
}

/** message.item_type values. 0 is a normal message; the rest are system/group items. */
export const ITEM_TYPE = {
    MESSAGE: 0,
    PARTICIPANT_CHANGE: 1,
    GROUP_NAME_CHANGE: 2,
    GROUP_ICON_CHANGE: 3
} as const;

/** message.group_action_type (meaningful when item_type === PARTICIPANT_CHANGE). */
export const GROUP_ACTION_TYPE = {
    ADD: 0,
    REMOVE: 1
} as const;

/** chat.style. */
export const CHAT_STYLE = {
    GROUP: 43,
    DIRECT: 45
} as const;
