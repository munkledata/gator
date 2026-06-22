# Audit follow-ups (2026-06-21 security/functional audit)

The full cross-repo audit lives in the app repo at
`bluebubbles-rn/SECURITY_FUNCTIONAL_AUDIT_2026-06-21.md`. All server findings were fixed and
merged to `master` (verification at merge: `tsc --noEmit` clean, 249 tests pass). These are the
items deliberately left open.

## DONE — F18: cloud credentials moved to the macOS Keychain (2026-06-22)

The 5 long-lived **cloud** credentials (FCM service-account, OAuth client secret, VAPID private
key, Cloudflare DDNS token, zrok token) are now stored in the macOS login Keychain, not the
plaintext `config.db`:
- `data/config-db/SecretStore.ts` — `MacKeychainSecretStore` via the `security(1)` CLI (secret on
  STDIN, never argv; 5s spawn timeout so a locked keychain degrades instead of hanging boot;
  `available()` proves real read access with a sentinel round-trip).
- `data/config-db/VaultedConfigStore.ts` — decorator that migrates existing plaintext → Keychain
  (verify-before-redact, so a keychain failure can never lose a credential), redacts them from disk,
  VACUUMs to purge old plaintext bytes, re-hydrates in memory so consumers are unchanged, serializes
  writes (mutex), and tombstones cleared secrets so they can't be resurrected. Degrades to the
  plaintext `DrizzleConfigStore` on a host with no usable keychain.
- The server `password` intentionally STAYS in `config.db` (with `chmod 0600`) — it's a bearer
  secret the app also holds, out of scope for "cloud credentials".
- Verified: 265 tests (incl. a real-Keychain round-trip), an adversarial review, and an end-to-end
  proof against a copy of the live `config.db` (zero secret bytes left in the file).

Remaining for F18:
- **On-device validation (packaged build):** confirm that a codesigned/notarized app launched by
  launchd (no interactive login) does NOT get an interactive Keychain ACL prompt on the first
  `security` access, and that the daemon boots cleanly. The 5s timeout guarantees no hang
  (degrades to a loud "credentials unavailable" warning), but the prompt behavior itself can only be
  verified on a real packaged build. If it prompts, set an explicit non-prompting ACL on write.
- Still **exclude the userData dir from Time Machine / iCloud backups** — the `password` and any
  non-vaulted residual remain on disk (file permissions don't protect a copied DB).

## Also fixed (2026-06-22): LAN-URL interface selection

`networking/lanAddress.ts` `getLanIpv4()` returned the first non-internal IPv4, which on a host with
a virtual interface (e.g. `feth*` from a VM/virtualization tool) reported an unreachable address
(observed: `10.144.47.51` instead of the real Wi-Fi `192.168.1.205`). It now skips virtual/tunnel/VM
interfaces (`feth`/`bridge`/`utun`/`awdl`/…) and prefers the physical private-LAN interface.

## Needs live-host validation (fixed in code; static review can't confirm)

- **F1 — live fanout hydration.** `wireMessageFanout` now hydrates `chats[]`/`handle` (by ROWID /
  handle_id) and attaches a top-level `chatGuid`. Confirm against a real `chat.db` that the live
  socket + FCM DTO actually carry the chat association and the app places the message + notifies.
- **F17 — tunnel API-only listener.** zrok now targets a dedicated `withUi:false` loopback listener;
  `mountFirebaseSetupRoutes` (the `/oauth/callback`) and the static admin SPA are gated on `withUi`.
  Confirm behind a real zrok binary that the admin SPA and the OAuth callback are NOT reachable
  through the public tunnel, and that the API + sockets still work over it.
- **F19 — crash resilience.** Added a non-exiting `unhandledRejection`/`uncaughtException` logger and
  `.catch` on the fire-and-forget ingestion sinks (poll / webhook / notify), plus degrade-to-empty on
  transient DB reads. Confirm a transient `chat.db` `SQLITE_BUSY`/`IOERR` no longer crashes the daemon.
- Helper-sourced live event payload shapes (typing / read-status / group / facetime) emitted by the
  macOS BlueBubbles-helper dylib (not in this repo) should be validated against the app's zod schemas.

## Note

- **F26 — logger redaction.** A light recursive redactor was added to `packages/bbd/src/core/logger.ts`
  for known secret-ish keys; sanity-check it doesn't add measurable overhead on hot log paths.
