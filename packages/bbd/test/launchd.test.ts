import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLaunchAgentPlist, LaunchAgentManager, type LaunchctlRunner } from "../src/host-platform/launchd";

test("plist contains the essential keys", () => {
    const xml = generateLaunchAgentPlist({
        label: "app.bluebubbles.bbd",
        programPath: "/usr/local/bin/bbd",
        args: ["--config", "x"],
        keepAlive: true,
        runAtLoad: true,
        stdoutPath: "/tmp/out.log"
    });
    assert.match(xml, /<key>Label<\/key>\s*<string>app\.bluebubbles\.bbd<\/string>/);
    assert.match(xml, /<key>ProgramArguments<\/key>/);
    assert.match(xml, /<string>\/usr\/local\/bin\/bbd<\/string>/);
    assert.match(xml, /<string>--config<\/string>/);
    assert.match(xml, /<key>KeepAlive<\/key>\s*<true\/>/);
    assert.match(xml, /StandardOutPath/);
});

test("install writes the plist and bootstraps it into the user's GUI domain", async () => {
    const writes: { path: string; content: string }[] = [];
    const calls: string[][] = [];
    const mgr = new LaunchAgentManager({
        agentDir: "/Users/x/Library/LaunchAgents",
        uid: 501,
        writeFile: async (p, c) => void writes.push({ path: p, content: c }),
        removeFile: async () => {},
        launchctl: { run: async args => void calls.push([...args]) } as LaunchctlRunner
    });
    await mgr.install({ label: "app.bluebubbles.bbd", programPath: "/bin/bbd" });
    assert.equal(writes[0]!.path, "/Users/x/Library/LaunchAgents/app.bluebubbles.bbd.plist");
    assert.match(writes[0]!.content, /<plist/);
    // gui/<uid> domain — a LaunchAgent in the Aqua session, not a system LaunchDaemon
    assert.deepEqual(calls[0], ["bootstrap", "gui/501", "/Users/x/Library/LaunchAgents/app.bluebubbles.bbd.plist"]);
});

test("uninstall boots out and removes the plist", async () => {
    const removed: string[] = [];
    const calls: string[][] = [];
    const mgr = new LaunchAgentManager({
        agentDir: "/A",
        uid: 501,
        writeFile: async () => {},
        removeFile: async p => void removed.push(p),
        launchctl: { run: async a => void calls.push([...a]) }
    });
    await mgr.uninstall("app.bluebubbles.bbd");
    assert.deepEqual(calls[0], ["bootout", "gui/501/app.bluebubbles.bbd"]);
    assert.deepEqual(removed, ["/A/app.bluebubbles.bbd.plist"]);
});
