# Gator vs. BlueBubbles: Fork Analysis

**Scope:** `cleanup/unused-code-vite-node24` @ `a7da6fa9` vs. upstream
`BlueBubblesApp/bluebubbles-server@master` (merge-base `95204ac1`).
Divergence: **51 commits, 472 files, +25,169 / −59,182**.
Method: static analysis only (read-only; nothing was run). Security findings were
each double-verified by independent adversarial agents — **27 of 32 raw findings
survived; 5 were rejected** as false-positives or "verified-clean" notes.

---

## STATUS UPDATE — verified 2026-06-30

Everything from "## 1" down is the ORIGINAL fork-analysis snapshot (kept for the record). Since
then the findings were re-verified against the current code on `master`; **most are remediated**.
Current state:

### Security (S1–S18)
- **Fixed + verified in code:** S1 (trust is now a per-boot local token via `isTrustedLocal`, NOT
  source-IP — a loopback request with no token gets 401, proven by `test/backendSmoke.test.ts`),
  S2 (empty password never authenticates; constant-time `safeEqual`), S3 + S7 (both read paths share
  one `sanitizeConfig` stripping password/FCM/OAuth/Cloudflare-DDNS-token/zrok/VAPID), S5 (RateLimiter
  instantiated in `backend.ts` + shared across REST/socket/attachment/avatar), S6 (socket handshake
  auth + `AUTHED_ROOM` broadcast gating), S8 (config.db + WAL/SHM chmod 0600), S9/S12/S13/S15 (CSP +
  nav guards, loopback-only OAuth callback, header-auth default, destructive-IPC confirmation), S17
  (`node-mac-permissions` declared), **S11 (install-time dep scripts gated via `.npmrc
  ignore-scripts=true` + explicit allowlisted native rebuilds — see Remediation notes)**.
- **Partial:** S4 (a real HTTPS listener now exists + default bind is loopback, so plain HTTP is not on
  `0.0.0.0` by default; `?password=` is retained only as a fallback behind header auth — the S13
  Low/Info residual). S14 (`openExternal` is scheme-allowlisted on the IPC + window-open paths; the
  `will-navigate` fallback is not).
- **Deferred (trusted-registry machine — the proxied registry here strips integrity hashes):** S10/S16
  lockfile integrity + `npm ci`, S18 EOL build-toolchain bump. See "Remediation notes".

### Feature gaps (Section 3)
- **Restored:** attachment send, full-fidelity text send, `message/query`, `server/info`, single-chat
  get, contact query + avatar bytes, live realtime relay (helper events forwarded + envelope-validated),
  core group management (create/add/remove/rename/leave), FindMy (friends boot-seeded on a timer), zrok
  tunnel (now enrolls + `share`s + auto-restarts — no longer "only stores config"), LAN URL (real LAN IP,
  skips virtual interfaces). The `protocol` package now also exports typed DTOs, not just the envelope.
- **Still removed / open (lower-priority parity):** group icon/mark-unread/contact-card, attachment media
  richness (transcode/resize/blurhash/live-photo), legacy `/fcm/*` paths + 504 status + VCF + chunked
  socket transfer, Google Contacts, iCloud alias mgmt, macOS lock/restart-Messages, message search,
  auto-update, theme/settings backup-sync, managed ngrok/cloudflared tunnels.

### Improvements (Sections 4 & 5)
- **Fixed:** daemon respawn with capped exponential backoff (not `app.quit()`), config.db RENAMEs legacy
  tables instead of dropping them (no data loss), CI gates every PR (typecheck + test + lint) with a
  composition-root smoke test, health endpoint, `electron-builder` publish target → `munkledata/gator`,
  CONTRIBUTING/README rebranded + corrected (arm64 / min 26.0), dead update-available UI removed.
- **Open:** config backup/restore + non-destructive `reset-app` (only a host-side confirmation added so
  far); metrics endpoint + log rotation.

### Follow-ups (AUDIT_FOLLOWUPS.md)
- **Fixed:** F18 keychain credential custody + **Time Machine / iCloud exclusion of the userData dir**
  (`tmutil addexclusion`), LAN-URL interface selection, F26 logger redaction, **helper-event validation**
  (frames are envelope-validated before relay to sockets/webhooks).
- **Needs on-device proof (wired in code):** F18 launchd keychain-ACL prompt, F1 live fanout hydration,
  F17 tunnel-listener callback/SPA omission, F19 crash resilience under transient `chat.db` errors.

**Net:** the security-critical work is complete. What remains is (a) two documented trusted-registry
deferrals (S10/S16 + S18), (b) on-device validation of four already-wired items, and (c) a
lower-severity feature-parity backlog.

---

## 1. What this fork is now

Upstream BlueBubbles is a single Electron god-object (`Server()`) running Koa +
Socket.IO + TypeORM, bundling tunnel binaries (ngrok/cloudflared/zrok), using
`firebase-admin` for push. Gator has been rewritten into a **4-package workspace**
via a (near-complete) strangler-fig migration:

| Package | Role | Transformation |
|---|---|---|
| `server` | Thin Electron shell (`main.ts` + `preload.ts` only) | Was the entire app; now just `utilityProcess.fork()`s the daemon and opens a window |
| `bbd` | The real backend (headless daemon) | New. Fastify + Socket.IO + **drizzle/better-sqlite3**, ~30 operations on one `OperationRegistry` mounted on both REST and socket |
| `protocol` | Frozen v1 wire contracts | New |
| `ui` | React renderer served over localhost | **Chakra→Mantine**, **CRA→Vite**, dark-mode-only, rebranded "Gator" |

Other shifts: **Node 24**, `firebase-admin` → hand-rolled **FCM HTTP v1** (RS256 JWT
on `node:crypto`), automatic Firebase provisioning via Google OAuth PKCE, and a
"degrade gracefully without `chat.db`" posture. **chat.db is opened strictly
read-only**; the write path goes through a Private-API helper over a chmod-0600
Unix socket.

**Overall:** the rewrite is high quality (clean DI, parameterized SQL, 39-file test
suite for `bbd`), but it is **functionally a much smaller re-implementation** than
upstream, and a recurring pattern — *security controls implemented and unit-tested
but never wired into the composition root* — leaves the shipped daemon weaker than
the code suggests.

---

## 2. Security issues

> Headline is a **chain**: the API binds `0.0.0.0` over plain HTTP, treats any
> loopback peer as fully trusted (no password), and the documented deployment
> (TLS-terminating reverse proxy on the same Mac) makes **every remote client
> appear as loopback**. Combine with the `get-config` secret leak and you have
> unauthenticated remote disclosure of all iMessage data *and* every credential.

### Top tier (High — effectively critical given the data exposed)

- **S1 — Loopback trust = password-free full admin.** `fastifyAdapter.ts` sets
  `trusted = isLoopback(request.ip)`; `execute.ts:40` skips the password when
  trusted. No `trustProxy`, so behind the expected same-host reverse proxy the
  socket peer is always `127.0.0.1` → password bypassed for the whole admin
  surface. *Fork-introduced.*
- **S2 — Default password is `""`, and the loopback path never checks length.**
  `configSchema.ts` defaults `password: ""`; the trusted path short-circuits before
  the empty-password guard. Fresh install fully open to loopback/proxied callers.
- **S3 — `admin/command → get-config` returns ALL secrets in plaintext** (server
  password, FCM private key, OAuth client secret, Cloudflare token, zrok token,
  VAPID private key). REST `/config` strips them; the admin path does not.
- **S4 — No TLS in `bbd`; HTTP+Socket.IO on `0.0.0.0`.** Password also accepted as
  `?password=` query param. `https-only` is string validation of the advertised
  address only; the daemon never speaks TLS.

### Medium

- **S5** — RateLimiter implemented but never instantiated (brute-force lockout dead).
- **S6** — Socket.IO has no connect-time auth; unauthenticated sockets stay
  connected and receive broadcast new-message DTOs / logs / config events.
- **S7** — `sanitizeConfig` omits Cloudflare DDNS token & VAPID private key even on
  the "safe" REST `/config`.
- **S8** — `config.db` (all secrets at rest) created with default umask (no
  `chmod 0600`), unlike the private-API socket.
- **S9** — Window loads UI over network HTTP with no CSP / no navigation guards
  (upstream used `file://`); preload `window.bbShell` exposed on a spoofable origin.
- **S10** — Lockfile has ZERO integrity hashes for all 985 deps; CI uses
  `npm install` not `npm ci`.
- **S11** — `postinstall` compiles native C++ on the signing host with no integrity
  gate; empty `allowScripts` key implies a lavamoat allowlist that isn't installed.

### Low / Info

- **S12** — `/oauth/callback` unauthenticated on all interfaces; non-constant-time
  state compare — restrict to loopback.
- **S13** — Credentials in query string leak via proxy/CDN logs, Referer, history.
- **S14** — `shell.openExternal` passes renderer-supplied URLs with no scheme
  allowlist.
- **S15** — `BrowserWindow` `sandbox` not explicit; destructive shell IPC
  (`reset-app`, restarts) callable from renderer with no host-side confirmation.
- **S16** — Lockfile pins `lodash@4.18.1`, a version that doesn't exist.
- **S17** — `bbd` imports `node-mac-permissions` without declaring it.
- **S18** — EOL build toolchain (eslint 8, prettier 2, babel-loader 8, webpack-cli
  4) on the signing host. (Runtime deps are current.)

### Verified clean
No SQL injection (parameterized; whitelisted identifiers) · attachment download has
a correct Attachments-root traversal guard · `osascript` uses `execFile` with
positional argv · ad-hoc signing walks build-output paths only · **no secrets
committed or bundled** · hand-rolled FCM crypto removes a CVE-prone dependency tree
(shifts correctness review in-house).

### Cross-cutting theme
**S5, S6, S7, and the webhook SSRF guard are all "built but not mounted."** The
RateLimiter, Socket auth, SSRF allow-list, and WebPush transport all exist in code
(some unit-tested) but `backend.ts` never wires them in. No test imports
`backend.ts`/`daemon-entry.ts`, so the gap between "component works" and "component
is mounted" is invisible to CI.

---

## 3. Feature gaps vs. upstream

### Remote access — biggest regression
Upstream shipped a **zero-config public HTTPS endpoint** (default `cloudflared`
tunnel) plus ngrok, zrok, and a self-signed-cert HTTPS server. Gator removed all of
it: ngrok (gone), Cloudflare tunnel (gone; kept feature is a DDNS A-record updater),
self-signed TLS/HTTPS server (gone), zrok (advertised "Recommended" in UI but
**non-functional** — only stores config), LAN URL (broken — writes
`http://localhost:1234`). Only working off-LAN path: manual DDNS + user port-forward
+ user TLS. `TunnelProvider` abstraction is unwired scaffold.

### Messaging & real-time
- **Send attachments / multipart: gone.**
- **Text send narrowed** to `{chatGuid, text, subject}` — lost effects, attributed
  text, replies, `tempGuid`, `ddScan`.
- **Real-time events collapsed to `new-message`/`updated-message`** (chat.db
  poller). Lost typing, read receipts, group rename/icon, participant changes,
  incoming-FaceTime, FindMy location.
- **Group management gone** (create/add/remove/rename/icon/mark-unread/contact-card).
- **Attachments raw bytes only** — lost transcode/resize/quality, live-photo,
  blurhash, count.
- Also removed: Google Contacts, iCloud account/alias, macOS lock/restart-Messages,
  message search, auto-update, theme/settings backup sync.

### API compatibility — stock clients break
`protocol` "frozen v1" covers the **envelope only**, not endpoints. Stock clients
fail on `message/query`, attachment/multipart send, `fcm/device`+`fcm/client`,
`server/info` metadata, chat/group management, theme/settings backup, chunked socket
transfer, VCF, ~13/15 live socket events. `encrypted` field and `504` dropped.

---

## 4. Improvements still needed (non-security)

- **Daemon crash kills the whole app** — `main.ts` calls `app.quit()` on backend
  exit; no respawn/backoff/watchdog. LaunchAgent story is fiction (scaffold unwired).
- **`config.db` boot self-heal silently DROPs legacy tables** — data loss on upgrade.
- **Master CI runs zero tests/lint/typecheck**; `bbd` gate fires only on `bbd-v*`
  tags; no `pull_request` trigger. No tests for `ui`/`server`/`protocol`. Tested
  artifact (SEA `dist/bbd`) isn't the shipped one (`daemon-entry.cjs` under Electron).
- No health endpoint, metrics, or log rotation.
- **electron-builder publishes to upstream `BlueBubblesApp` repo.**
- **Notarization disabled** + no auto-update → Gatekeeper "damaged", no guidance.
- **CONTRIBUTING.md is 100% upstream**; README clone URL points upstream; README
  advertises removed "tunnels" + stale macOS 10.x note (build is arm64/min 26.0).
- **Partial rebrand:** package names `@bluebubbles/*`, sponsor links still fund
  `BlueBubblesApp`, 29 `docs.bluebubbles.app` links.
- **Dead update plumbing** (UI subscribes to `update-available`; hard-fail stub).
- **No config backup/restore**; `reset-app` deletes config.db with no backup.
- Minor: `@emotion/babel-plugin` inert under Vite; native-addon ABI flip-flop
  undocumented.

---

## 5. Recommended priority order

1. Fix the auth chain (S1–S4): bind `127.0.0.1` by default, stop trusting source-IP,
   require a non-empty password, sanitize `get-config`.
2. Wire the controls that already exist (S5–S7 + webhook SSRF); add a
   composition-root smoke test.
3. `chmod 0600 config.db` (S8); regenerate integrity-bearing lockfile + `npm ci`
   (S10/S16).
4. Gate every PR with typecheck + test; add a daemon-respawn/watchdog.
5. Resolve the remote-access lie: implement zrok/tunnel for real or remove the UI;
   fix `save-lan-url`.
6. Finish rebrand housekeeping: publish target, sponsor links, CONTRIBUTING/README,
   dead update UI, notarization-or-docs.

---

*Caveats: static analysis — "absent" means no route/handler in source, not a runtime
probe; severity reflects verified consensus (top-tier items rated High individually
but chain into critical impact for this data class).*

---

## Remediation notes

**S10 / S16 — lockfile integrity (deferred to a trusted-registry machine).** In *this*
build environment `registry.npmjs.org` is reached through a transparent proxy that
strips Subresource-Integrity (`integrity`) hashes and returns a synthetic
`lodash@4.18.1` (a version that does not exist upstream). As a result, a clean
`rm package-lock.json && npm install` *here* does NOT repopulate integrity — it just
re-emits the same hash-less, synthetic-pinned lockfile. The real fix must be run on a
machine with DIRECT npmjs.org access:

```bash
rm -rf node_modules package-lock.json
npm install        # repopulates integrity + resolved from the real registry
# commit the regenerated lockfile
```

CI then enforces it with `npm ci` (done — `main.yml`, `bbd-daemon.yml`, and the new
`ci.yml` all use `npm ci`, which fails if the lockfile drifts or lacks integrity).

**S18 — EOL build toolchain bump (deferred to the same trusted-registry machine).** The
build toolchain (eslint 8, prettier 2, babel-loader 8, webpack-cli 4) is past EOL and
should be upgraded — notably the eslint 8 → 9 flat-config migration. This is deferred
because it cannot be installed or verified in this proxied environment (same
integrity-stripping issue as above); it should be done where the new versions can be
installed against the real registry and the build/lint actually run.

**S11 — native-build integrity gate (FIXED 2026-06-30).** Root `.npmrc` now sets
`ignore-scripts=true`, so `npm ci`/`npm install` no longer auto-runs ANY dependency's
install/lifecycle scripts on the signing host — closing the "a compromised transitive dep
runs arbitrary C++ at build time and gets baked into a signed artifact" vector. The three
KNOWN native modules are rebuilt EXPLICITLY instead: `packages/server`'s `start`/`dist`/`release`
prepend `npm run rebuild` (the `electron-rebuild` CLI, which compiles directly and is unaffected
by `ignore-scripts`), and CI (`ci.yml`, `bbd-daemon.yml`) runs `npm rebuild better-sqlite3
--ignore-scripts=false` (an explicit per-package allow) for the Node-ABI test build. The
former blanket `postinstall: electron-rebuild install-app-deps && npm run rebuild` was removed
(it was the anti-pattern). Verified: `npm run <script>` still executes under the gate, the
`--ignore-scripts=false` override rebuilds, and the bbd suite passes (291 tests). A full
electron-builder release build under the gate should be confirmed on the next packaged build
(electron-builder's own `npmRebuild` also rebuilds natives during pack).
