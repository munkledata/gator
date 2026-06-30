// electron-builder `afterPack` hook — signs the packaged .app.
//
// DEFAULT (no identity available): AD-HOC sign. Enough to stop the "damaged" error on your own
// Macs after clearing quarantine, but ad-hoc's designated requirement is a per-build `cdhash`, so
// macOS TCC grants (Full Disk Access, Accessibility, Automation) are orphaned on every rebuild.
//
// STABLE SIGNING (recommended for a redeployed server): if `~/.gator-signing/sha1.txt` holds a
// code-signing cert's SHA-1, the app is signed with that cert instead. The designated requirement
// becomes `identifier … and certificate leaf = H"…"`, which is identical across rebuilds — so the
// TCC grants you give it survive redeploys. The cert lives in a dedicated, password-known keychain
// (so codesign can use the key without a GUI prompt); set it up once with scripts/setup-signing.sh.
// Everything machine-local lives in ~/.gator-signing (never committed). Falls back to ad-hoc if
// absent, so a fresh checkout still builds.

const { execFileSync } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

const SIGN_DIR = path.join(os.homedir(), ".gator-signing");
const read = (f) => {
    try {
        return fs.readFileSync(path.join(SIGN_DIR, f), "utf8").trim();
    } catch {
        return "";
    }
};

// The signing identity: a cert SHA-1 from ~/.gator-signing (or $GATOR_SIGN_ID), else "-" (ad-hoc).
// When a cert is configured, make sure its dedicated keychain is unlocked + on the search list so
// codesign can use the key (its partition list pre-authorizes codesign — no GUI prompt).
function resolveSignId() {
    const sha = process.env.GATOR_SIGN_ID || read("sha1.txt");
    if (!sha) return "-";
    const kc = read("keychain.txt");
    const kcPass = read("kc-pass.txt");
    if (kc && kcPass) {
        try {
            execFileSync("security", ["unlock-keychain", "-p", kcPass, kc], { stdio: "ignore" });
            const list = execFileSync("security", ["list-keychains", "-d", "user"], { encoding: "utf8" })
                .split("\n")
                .map((s) => s.replace(/[" ]/g, ""))
                .filter(Boolean);
            if (!list.includes(kc)) {
                execFileSync("security", ["list-keychains", "-d", "user", "-s", kc, ...list], {
                    stdio: "ignore",
                });
            }
        } catch {
            /* codesign will surface a clear error if the identity can't be used */
        }
    }
    return sha;
}

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
    const signId = resolveSignId();
    const how = signId === "-" ? "ad-hoc" : `stable identity ${signId.slice(0, 10)}…`;

    console.log(`  • [adhoc-sign] signing ${appPath} (${how})`);

    // 1. Sign nested native modules first (inside-out).
    const nested = findNestedBinaries(appPath, []);
    for (const bin of nested) {
        codesign(["--force", "--sign", signId, "--timestamp=none", bin]);
    }
    console.log(`  • [adhoc-sign] signed ${nested.length} nested .node/.dylib binaries`);

    // 2. Seal the whole bundle (covers Frameworks + Helper apps).
    codesign(["--force", "--deep", "--sign", signId, "--timestamp=none", appPath]);

    // 3. Verify the signature is valid and internally consistent. Throws (fails the build) if not.
    codesign(["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    console.log(`  • [adhoc-sign] signature verified OK`);
};
