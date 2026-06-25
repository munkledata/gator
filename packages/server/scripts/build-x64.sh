#!/usr/bin/env bash
#
# Build an Intel (x86_64) Gator DMG.
#
# The three native addons (better-sqlite3, node-mac-contacts, node-mac-permissions) are
# installed for the host arch (arm64 on an Apple-Silicon dev Mac). This script cross-rebuilds
# them for x64 against Electron, builds the UI + bbd + server with the x64 electron-builder
# config, then ALWAYS restores the arm64 natives (EXIT trap) so the host dev env keeps working
# even if the build fails partway.
#
# Usage:
#   npm run build-x64                              # from the repo root
#   bash packages/server/scripts/build-x64.sh      # directly
#
# Output: dist/Gator-<version>-x64.dmg
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SERVER/../.." && pwd)"
MODLIST="better-sqlite3,node-mac-contacts,node-mac-permissions"
BS="$ROOT/node_modules/better-sqlite3"

restore_arm64() {
    echo "[x64] restoring arm64 native modules (host dev env)..."
    ( cd "$SERVER" && npx electron-rebuild -f -a arm64 -o "$MODLIST" ) \
        || echo "[x64] WARNING: arm64 restore failed — run 'cd packages/server && npm run rebuild' manually"
    rm -rf "$BS"/bin/darwin-x64-* 2>/dev/null || true
}
# Whatever happens after this point, leave the host on arm64.
trap restore_arm64 EXIT

echo "[x64] cross-rebuilding native modules for x64 (against Electron)..."
( cd "$SERVER" && npx electron-rebuild -f -a x64 -o "$MODLIST" )

# better-sqlite3 resolves bin/<platform>-<arch>-<abi> before build/Release at runtime, so give
# x64 its own cache entry mirroring the freshly built x64 binary (reuse the ABI from the arm64 dir).
ABI="$(ls "$BS/bin" 2>/dev/null | sed -n 's/^darwin-arm64-//p' | head -1 || true)"
if [ -n "$ABI" ]; then
    mkdir -p "$BS/bin/darwin-x64-$ABI"
    cp "$BS/build/Release/better_sqlite3.node" "$BS/bin/darwin-x64-$ABI/better-sqlite3.node"
    echo "[x64] seeded better-sqlite3 bin/darwin-x64-$ABI"
fi

echo "[x64] building UI + bbd..."
( cd "$ROOT" && npm run build-ui && npm run build-bbd )

echo "[x64] packaging x64 DMG..."
( cd "$SERVER" \
    && npm run build \
    && npx electron-builder build --mac --publish never --config ./scripts/electron-builder-config.x64.js )

mkdir -p "$ROOT/dist"
cp "$SERVER"/releases/*-x64.dmg "$ROOT/dist/"
echo "[x64] DMG ready:"
ls -lh "$ROOT"/dist/*-x64.dmg

# (EXIT trap now restores arm64)
