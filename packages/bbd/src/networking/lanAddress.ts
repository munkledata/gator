import os from "node:os";

/**
 * The machine's primary non-loopback IPv4 address, for the "LAN URL" pairing case.
 *
 * The fork's `save-lan-url` previously hard-coded `http://localhost:PORT`, which is
 * only reachable on the server machine itself — a phone scanning the pairing QR would
 * get `localhost` and fail to connect. This returns the real LAN address so other
 * devices on the same network can reach the server.
 */
export function getLanIpv4(): string | null {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const ni of ifaces[name] ?? []) {
            // Node <18 typed `family` as string ("IPv4"); newer returns 4 — accept both.
            const isV4 = ni.family === "IPv4" || (ni.family as unknown) === 4;
            if (isV4 && !ni.internal) return ni.address;
        }
    }
    return null;
}
