#!/usr/bin/env bash
#
# Deploy a Gator DMG from THIS Mac (your laptop) to a remote Mac (the Intel mini) over SSH and
# install it there — one command, end to end.
#
# Prereqs on the mini (one-time):
#   - System Settings → General → Sharing → enable "Remote Login" (SSH)
#   - key auth from this laptop:   ssh-copy-id user@host
#
# Usage:
#   ./deploy-to-mini.sh [user@host] [path-to-dmg]
#   MINI=user@host ./deploy-to-mini.sh            # or set the default below / via env
#
set -euo pipefail

# ── config: set your mini once here, or pass user@host as the first arg / MINI env ──
MINI="${1:-${MINI:-CHANGE_ME}}"
# ────────────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
INSTALLER="$HERE/install-gator.sh"

if [ "$MINI" = "CHANGE_ME" ]; then
    echo "❌ Set your mini's SSH target — edit MINI at the top of this script, or:"
    echo "     $0 user@your-mini.local"
    exit 1
fi

# DMG: 2nd arg, else newest dist/*-x64.dmg
DMG="${2:-}"
if [ -z "$DMG" ]; then
    DMG="$(ls -t "$ROOT/dist"/*-x64.dmg 2>/dev/null | head -1 || true)"
fi
[ -n "$DMG" ] && [ -f "$DMG" ] || { echo "❌ No x64 DMG found. Build one (npm run build-x64) or pass a path: $0 $MINI /path/to/Gator-x.y.z-x64.dmg"; exit 1; }
[ -f "$INSTALLER" ] || { echo "❌ install-gator.sh not found next to this script."; exit 1; }

echo "▶ Deploying $(basename "$DMG") → $MINI"

echo "1) Checking passwordless SSH to $MINI ..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$MINI" 'true' 2>/dev/null; then
    echo "❌ Can't SSH to $MINI without a password."
    echo "   • On the mini: System Settings → General → Sharing → enable Remote Login."
    echo "   • From here:   ssh-copy-id $MINI"
    exit 1
fi

REMOTE_DIR="/tmp/gator-deploy"
echo "2) Copying DMG + installer to $MINI:$REMOTE_DIR ..."
ssh "$MINI" "mkdir -p '$REMOTE_DIR'"
scp -q "$DMG" "$INSTALLER" "$MINI:$REMOTE_DIR/"

echo "3) Installing on $MINI (quit → replace → relaunch) ..."
ssh "$MINI" "bash '$REMOTE_DIR/install-gator.sh' '$REMOTE_DIR/$(basename "$DMG")'"

echo "4) Removing remote temp files ..."
ssh "$MINI" "rm -rf '$REMOTE_DIR'" 2>/dev/null || true

cat <<EOF

✅ Deployed to $MINI.

⚠️  Full Disk Access can't be granted over SSH — do this once on the mini's screen
    (directly, or via Screen Sharing from this laptop):
      System Settings → Privacy & Security → Full Disk Access
      → remove any old "Gator", add /Applications/Gator.app, toggle ON.
EOF
