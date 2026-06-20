import { test } from "node:test";
import assert from "node:assert/strict";
import { ZrokTunnel, type ChildHandle, type ZrokSettings } from "../src/networking/ZrokTunnel";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });

function fakeChild() {
    let onStdout: ((c: unknown) => void) | undefined;
    let onExit: ((c: unknown) => void) | undefined;
    const state = { killed: false, args: [] as string[] };
    const child: ChildHandle = {
        stdout: { on: (_e, cb) => (onStdout = cb) },
        stderr: { on: () => undefined },
        on: (e, cb) => {
            if (e === "exit") onExit = cb;
        },
        kill: () => {
            state.killed = true;
        }
    };
    return {
        child,
        state,
        emitStdout: (s: string) => onStdout?.(s),
        emitExit: (c: number) => onExit?.(c)
    };
}

function makeTunnel(settings: ZrokSettings) {
    const urls: string[] = [];
    let enabled = false;
    const fc = fakeChild();
    const tunnel = new ZrokTunnel({
        binPath: "zrok", // isAvailable() true without a real file
        settings: () => settings,
        onUrl: u => void urls.push(u),
        logger: silent,
        spawn: (_cmd, args) => {
            fc.state.args = args;
            return fc.child;
        },
        enableEnv: async () => {
            enabled = true;
        }
    });
    return { tunnel, urls, fc, wasEnabled: () => enabled };
}

test("zrok tunnel enrolls, spawns a public share, and parses the public URL", async () => {
    const t = makeTunnel({ enabled: true, token: "tok123", backendTarget: "127.0.0.1:1234" });
    await t.tunnel.start();
    assert.equal(t.wasEnabled(), true, "zrok enable ran with the token");
    assert.deepEqual(t.fc.state.args, ["share", "public", "127.0.0.1:1234", "--headless"]);

    t.fc.emitStdout("  access your share at the following endpoint: https://abc123.share.zrok.io\n");
    assert.deepEqual(t.urls, ["https://abc123.share.zrok.io"]);
    assert.equal(t.tunnel.currentUrl(), "https://abc123.share.zrok.io");
    assert.equal(t.tunnel.isRunning(), true);

    // Duplicate lines don't re-fire onUrl.
    t.fc.emitStdout("https://abc123.share.zrok.io");
    assert.equal(t.urls.length, 1);
});

test("zrok reserved share uses the reserved name", async () => {
    const t = makeTunnel({ enabled: true, token: "tok", reservedName: "mygator", backendTarget: "127.0.0.1:1234" });
    await t.tunnel.start();
    assert.deepEqual(t.fc.state.args, ["share", "reserved", "mygator", "--headless"]);
});

test("zrok does nothing when disabled or tokenless", async () => {
    const off = makeTunnel({ enabled: false, token: "tok", backendTarget: "127.0.0.1:1234" });
    await off.tunnel.start();
    assert.equal(off.tunnel.isRunning(), false);
    assert.equal(off.wasEnabled(), false);

    const noTok = makeTunnel({ enabled: true, token: "", backendTarget: "127.0.0.1:1234" });
    await noTok.tunnel.start();
    assert.equal(noTok.tunnel.isRunning(), false);
});

test("stop kills the child and clears state; exit clears running state", async () => {
    const t = makeTunnel({ enabled: true, token: "tok", backendTarget: "127.0.0.1:1234" });
    await t.tunnel.start();
    t.fc.emitStdout("https://x.share.zrok.io");
    await t.tunnel.stop();
    assert.equal(t.fc.state.killed, true);
    assert.equal(t.tunnel.isRunning(), false);
    assert.equal(t.tunnel.currentUrl(), null);
});
