# Audit follow-ups (2026-06-21 security/functional audit)

The full cross-repo audit lives in the app repo at
`bluebubbles-rn/SECURITY_FUNCTIONAL_AUDIT_2026-06-21.md`. All server findings were fixed and
merged to `master` (verification at merge: `tsc --noEmit` clean, 249 tests pass). These are the
items deliberately left open.

## Deferred — needs a decision / larger effort

- **F18 — Config secrets at rest.** `config.db` stores every credential in plaintext
  (server password, FCM service-account private key, Cloudflare DDNS token, zrok token, OAuth
  client secret, VAPID private key), protected only by `chmod 0600` (now confirmed applied to
  `config.db` + `-wal` + `-shm`; see the TODO in `packages/bbd/src/data/config-db/DrizzleConfigStore.ts`).
  Follow-up: move the long-lived **cloud** credentials into the macOS Keychain (Security framework
  / keytar), keeping only opaque references in `config.db`; and document that the userData dir must
  be excluded from Time Machine / iCloud backups (file permissions don't protect a copied DB).

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
