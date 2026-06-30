#!/usr/bin/env bash
#
# Create a stable, self-signed code-signing identity for Gator — run ONCE per build machine.
#
# Why: ad-hoc signing gives a per-build `cdhash` designated requirement, so macOS TCC grants
# (Full Disk Access, Accessibility, Automation) are orphaned on every redeploy. Signing with a
# constant cert makes the requirement `identifier … and certificate leaf = H"…"`, which is
# identical across builds — so the grants you give the server survive redeploys.
#
# Everything lives in ~/.gator-signing (machine-local, NEVER committed). adhoc-sign.js reads it and
# signs with this identity when present, falling back to ad-hoc otherwise.
#
# After running this, rebuild + deploy once, then re-grant FDA + Accessibility ONE last time
# (the signature changed from ad-hoc to cert). From then on, redeploys keep the grants.
#
set -euo pipefail

DIR="$HOME/.gator-signing"
KC="$HOME/Library/Keychains/gator-signing.keychain-db"
KC_PASS="gatorkc"     # password for the DEDICATED signing keychain (NOT your macOS login password)
P12_PASS="gatorpass"

mkdir -p "$DIR"; cd "$DIR"

if [ ! -f gator.crt ]; then
    cat > cert.cnf <<'EOF'
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = Gator Code Signing
[v3]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
    openssl req -x509 -newkey rsa:2048 -keyout gator.key -out gator.crt -days 3650 -nodes -config cert.cnf
    # macOS `security` can't import openssl 3's default PKCS12 — force the legacy SHA-1 MAC + 3DES.
    openssl pkcs12 -export -out gator.p12 -inkey gator.key -in gator.crt -name "Gator Code Signing" \
        -legacy -macalg sha1 -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -passout "pass:$P12_PASS"
fi

# A DEDICATED keychain with a known password lets codesign use the key with NO GUI prompt
# (its partition list pre-authorizes codesign) and keeps the login keychain untouched.
security delete-keychain "$KC" 2>/dev/null || true
security create-keychain -p "$KC_PASS" "$KC"
security set-keychain-settings "$KC"                 # no auto-lock timeout
security unlock-keychain -p "$KC_PASS" "$KC"
security import gator.p12 -k "$KC" -P "$P12_PASS" -A -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PASS" "$KC" >/dev/null
EXIST=$(security list-keychains -d user | sed 's/[" ]//g' | tr '\n' ' ')
security list-keychains -d user -s "$KC" $EXIST

SHA=$(openssl x509 -in gator.crt -noout -fingerprint -sha1 | sed 's/.*=//; s/://g')
printf '%s\n' "$SHA"      > "$DIR/sha1.txt"
printf '%s\n' "$KC"       > "$DIR/keychain.txt"
printf '%s\n' "$KC_PASS"  > "$DIR/kc-pass.txt"
chmod 600 "$DIR"/sha1.txt "$DIR"/keychain.txt "$DIR"/kc-pass.txt "$DIR"/gator.key "$DIR"/gator.p12

echo ""
echo "✅ Stable signing identity ready (cert SHA-1: $SHA)"
echo "   Builds now sign with it. Rebuild (npm run build-x64 / build), deploy, then re-grant"
echo "   Full Disk Access + Accessibility ONCE — they'll persist across future redeploys."
