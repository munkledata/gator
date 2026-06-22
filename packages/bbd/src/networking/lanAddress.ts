import os from "node:os";

type Ifaces = ReturnType<typeof os.networkInterfaces>;

/**
 * Virtual / tunnel / VM / link-local interface name prefixes that are NOT the machine's real
 * LAN, even though they expose a non-internal RFC-1918 IPv4. The original `getLanIpv4` returned
 * the FIRST non-internal IPv4 it found, which on a host running a VM/virtualization tool picks a
 * `feth*`/`bridge*` address (e.g. 10.x) unreachable by a phone on Wi-Fi — the wrong pairing URL.
 */
const VIRTUAL_IFACE = /^(feth|bridge|utun|tun|tap|awdl|llw|vmnet|vnic|ppp|ipsec|gif|stf|anpi|ap\d)/i;

/** Real, routable physical-LAN interfaces, in rough preference order (Wi-Fi/Ethernet first). */
const PHYSICAL_IFACE = /^(en|eth|wl)/i;

function isPrivateV4(addr: string): boolean {
    // RFC-1918 ranges; 169.254/16 APIPA link-local is naturally excluded (not in these blocks).
    return /^10\./.test(addr) || /^192\.168\./.test(addr) || /^172\.(1[6-9]|2\d|3[01])\./.test(addr);
}

/**
 * The machine's primary non-loopback IPv4 address, for the "LAN URL" pairing case.
 *
 * Picks the real physical-LAN interface (`en*`/`eth*`/`wl*`) over virtual/VM/tunnel interfaces
 * (`feth*`, `bridge*`, `utun*`, …) so a phone scanning the pairing QR gets a reachable address.
 * `ifaces` is injectable for testing; defaults to the live interface table.
 */
export function getLanIpv4(ifaces: Ifaces = os.networkInterfaces()): string | null {
    const candidates: { name: string; address: string }[] = [];
    for (const name of Object.keys(ifaces)) {
        for (const ni of ifaces[name] ?? []) {
            // Node <18 typed `family` as string ("IPv4"); newer returns 4 — accept both.
            const isV4 = ni.family === "IPv4" || (ni.family as unknown) === 4;
            if (!isV4 || ni.internal) continue;
            candidates.push({ name, address: ni.address });
        }
    }
    if (candidates.length === 0) return null;

    const physical = candidates.filter(c => PHYSICAL_IFACE.test(c.name) && !VIRTUAL_IFACE.test(c.name));
    const nonVirtual = candidates.filter(c => !VIRTUAL_IFACE.test(c.name));

    // Preference: physical + private LAN  →  any physical  →  any non-virtual  →  anything.
    return (
        physical.find(c => isPrivateV4(c.address))?.address ??
        physical[0]?.address ??
        nonVirtual.find(c => isPrivateV4(c.address))?.address ??
        nonVirtual[0]?.address ??
        candidates[0]?.address ??
        null
    );
}
