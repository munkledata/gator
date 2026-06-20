// electron-builder `afterPack` hook.
//
// The build machine has no valid Developer ID identity (only an expired
// "localhost" cert), so electron-builder skips code signing and leaves the
// app with Electron's placeholder signature (Identifier=Electron, resources
// not sealed). That invalid signature is why transferred copies report
// "Gator is damaged and can't be opened" on Apple Silicon.
//
// This hook ad-hoc signs the bundle so its signature is valid and self-consistent.
// Ad-hoc is enough to stop the "damaged" error on your own Macs (after removing
// quarantine). It is NOT a substitute for a Developer ID cert + notarization if
// you ever distribute to other people's machines.

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function codesign(args) {
    execFileSync("codesign", args, { stdio: "inherit" });
}

// Collect nested Mach-O binaries that a top-level `--deep` sign can miss —
// notably .node/.dylib files unpacked under Resources/app.asar.unpacked.
function findNestedBinaries(dir, acc) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            findNestedBinaries(full, acc);
        } else if (/\.(node|dylib)$/.test(entry.name)) {
            acc.push(full);
        }
    }
    return acc;
}

exports.default = async function adhocSign(context) {
    if (context.electronPlatformName !== "darwin") return;

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);

    console.log(`  • [adhoc-sign] ad-hoc signing ${appPath}`);

    // 1. Sign nested native modules first (inside-out).
    const nested = findNestedBinaries(appPath, []);
    for (const bin of nested) {
        codesign(["--force", "--sign", "-", "--timestamp=none", bin]);
    }
    console.log(`  • [adhoc-sign] signed ${nested.length} nested .node/.dylib binaries`);

    // 2. Seal the whole bundle (covers Frameworks + Helper apps).
    codesign(["--force", "--deep", "--sign", "-", "--timestamp=none", appPath]);

    // 3. Verify the signature is valid and internally consistent. Throws (fails
    //    the build) if not — so we never ship another "damaged" app silently.
    codesign(["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    console.log(`  • [adhoc-sign] signature verified OK`);
};
