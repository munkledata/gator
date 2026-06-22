import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { getLanIpv4 } from "../src/networking/lanAddress";

type Ifaces = ReturnType<typeof os.networkInterfaces>;

function v4(address: string, internal = false) {
    return { address, netmask: "255.255.255.0", family: "IPv4" as const, mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` };
}

test("prefers the physical Wi-Fi/Ethernet interface over a virtual feth/bridge interface (audit LAN bug)", () => {
    const ifaces = {
        lo0: [v4("127.0.0.1", true)],
        feth2599: [v4("10.144.47.51")], // virtual (VM/virtualization) — must NOT be chosen
        en0: [v4("192.168.1.205")] // real Wi-Fi LAN
    } as unknown as Ifaces;
    assert.equal(getLanIpv4(ifaces), "192.168.1.205");
});

test("skips utun/bridge/awdl virtual interfaces", () => {
    const ifaces = {
        utun3: [v4("10.20.30.40")],
        bridge0: [v4("172.16.0.1")],
        awdl0: [v4("169.254.1.2")],
        en1: [v4("192.168.50.10")]
    } as unknown as Ifaces;
    assert.equal(getLanIpv4(ifaces), "192.168.50.10");
});

test("falls back to a virtual interface only if there is no physical/non-virtual one", () => {
    const ifaces = {
        lo0: [v4("127.0.0.1", true)],
        feth0: [v4("10.0.0.5")]
    } as unknown as Ifaces;
    assert.equal(getLanIpv4(ifaces), "10.0.0.5");
});

test("returns null when only loopback is present", () => {
    const ifaces = { lo0: [v4("127.0.0.1", true)] } as unknown as Ifaces;
    assert.equal(getLanIpv4(ifaces), null);
});

test("prefers a private-range address among multiple physical interfaces", () => {
    const ifaces = {
        en5: [v4("203.0.113.9")], // public on a physical iface
        en0: [v4("192.168.1.205")] // private LAN
    } as unknown as Ifaces;
    assert.equal(getLanIpv4(ifaces), "192.168.1.205");
});
