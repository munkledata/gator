#!/usr/bin/env bash
#
# Build the headless bbd daemon as a single executable using Node's built-in
# Single Executable Application (SEA) support. No Electron.
#
# RISK (flagged in the original analysis as prototype-first): signing a Node-SEA
# binary that dlopen()s native addons (better-sqlite3) can trip library
# validation. This script is the pipeline; proving sign+notarize+staple on a real
# binary is the de-risk step that must pass before committing to this packaging.
#
set -euo pipefail
cd "$(dirname "$0")/.."

DIST="dist"
ENTRY="src/main.ts"        # daemon entrypoint (composes Daemon + services)
BUNDLE="$DIST/bbd.cjs"
BIN="$DIST/bbd"

rm -rf "$DIST" && mkdir -p "$DIST"

echo "==> Bundling $ENTRY -> $BUNDLE"
npx --yes esbuild "$ENTRY" \
  --bundle --platform=node --target=node22 --format=cjs \
  --external:better-sqlite3 \
  --outfile="$BUNDLE"

echo "==> Preparing SEA blob"
cat > "$DIST/sea-config.json" <<JSON
{
  "main": "$BUNDLE",
  "output": "$DIST/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "assets": {}
}
JSON

node --experimental-sea-config "$DIST/sea-config.json"

echo "==> Creating the executable"
cp "$(command -v node)" "$BIN"
# Remove the signature so we can inject + re-sign in CI.
codesign --remove-signature "$BIN" 2>/dev/null || true
npx --yes postject "$BIN" NODE_SEA_BLOB "$DIST/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

echo "==> Built $BIN"
echo "    (native better-sqlite3 is kept external; ship its .node alongside or"
echo "     vendor a prebuilt binary — verify under codesign before release.)"
