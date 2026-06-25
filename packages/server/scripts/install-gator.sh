#!/usr/bin/env bash
#
# Install a Gator DMG on THIS Mac (run it on the target machine — e.g. the Intel mini).
# Copy this script and the DMG to the mini, then:  bash install-gator.sh [path-to-dmg]
#
# If no path is given it picks the newest Gator-*.dmg next to this script.
#
set -euo pipefail

APP="/Applications/Gator.app"

DMG="${1:-}"
if [ -z "$DMG" ]; then
    DMG="$(ls -t "$(cd "$(dirname "$0")" && pwd)"/Gator-*.dmg 2>/dev/null | head -1 || true)"
fi
if [ -z "$DMG" ] || [ ! -f "$DMG" ]; then
    echo "❌ DMG not found."
    echo "   Usage: $0 /path/to/Gator-1.9.9-x64.dmg"
    exit 1
fi
echo "Installing from: $DMG"

echo "1) Quitting Gator (if running)..."
osascript -e 'quit app "Gator"' 2>/dev/null || true
sleep 2
pkill -f "$APP/Contents/MacOS/Gator" 2>/dev/null || true
sleep 1

echo "2) Mounting DMG..."
MNT="$(hdiutil attach "$DMG" -nobrowse -noautoopen | grep -o '/Volumes/.*' | head -1)"
if [ -z "$MNT" ] || [ ! -d "$MNT/Gator.app" ]; then
    echo "❌ Could not mount the DMG (or it has no Gator.app)."
    exit 1
fi
trap 'hdiutil detach "$MNT" -quiet 2>/dev/null || true' EXIT

echo "3) Replacing $APP..."
rm -rf "$APP"
cp -R "$MNT/Gator.app" "$APP"

echo "4) Clearing quarantine (this build is ad-hoc signed, not notarized)..."
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "5) Launching Gator..."
open "$APP"

cat <<EOF

✅ Gator installed to $APP

⚠️  Full Disk Access must be (re)granted — an ad-hoc-signed rebuild reads as a NEW app to macOS:
      System Settings → Privacy & Security → Full Disk Access
      → remove any existing "Gator" entry, then add $APP and toggle it ON
    Without FDA the server can't read Messages (chat.db) or the Find My caches.

    (If you also use the Private API / send features, re-grant Accessibility + Automation the same way.)
EOF
