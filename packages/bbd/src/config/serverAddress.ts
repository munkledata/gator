/**
 * The public-facing server address must be https. Clients reach the server over the
 * internet, so an http:// address would expose the password and message traffic in
 * the clear. We still permit http for loopback and private-LAN hosts — that's the
 * legitimate "LAN URL" case where there's no certificate and no internet exposure.
 */

const PRIVATE_HOST = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^::1$/,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./
];

/** True if `value` is an insecure http:// URL aimed at a public (non-LAN) host. */
export function isInsecurePublicUrl(value: unknown): boolean {
    if (typeof value !== "string" || !value.startsWith("http://")) return false;
    let host: string;
    try {
        host = new URL(value).hostname.replace(/^\[|\]$/g, "");
    } catch {
        // An unparseable http:// string isn't a valid LAN address either — reject it.
        return true;
    }
    return !PRIVATE_HOST.some(re => re.test(host));
}

/** Throw a clear error if the address is an insecure public http:// URL. */
export function assertSecureServerAddress(value: unknown): void {
    if (isInsecurePublicUrl(value)) {
        throw new Error("Insecure http:// server addresses are not allowed — use https://");
    }
}
