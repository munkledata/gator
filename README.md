# Gator Server

Gator Server is the macOS backend for the BlueBubbles app ecosystem. It reads your Mac's
iMessage database and exposes it to BlueBubbles clients (phone apps, browsers) over a local
HTTP + Socket.IO API — with push notifications, webhooks, scheduled messages, contacts, and
remote-access tunnels. It is packaged from, and wire-compatible with, BlueBubbles Server.

## Architecture

The repo is an npm workspace (`packages/*`). The original monolithic `Server()` god-object has
been strangled into a **headless daemon**; the Electron app is now a thin shell around it.

| Package | Role |
| --- | --- |
| `@bluebubbles/protocol` | **Frozen v1 wire contracts** shared by every client. Byte-stable — thousands of deployed clients depend on it, so treat it as an API contract, not editable code. |
| `@bluebubbles/bbd` | The **headless daemon** — all backend logic. Reads the iMessage `chat.db`, drives the private-API write path, runs the unified API (Fastify + Socket.IO), notifications (FCM / Web Push), the scheduler, webhooks, contacts, FaceTime/FindMy, tunnels + dynamic DNS, and a SQLite config store (Drizzle). Also serves the built UI as static files. Bundled to CommonJS with esbuild. |
| `@bluebubbles/server` | The **Electron shell** (`src/main.ts` + `src/preload.ts`). It `utilityProcess.fork()`s the bbd daemon, opens a window pointed at the local server, and provides the menu-bar tray plus a few host-only IPC actions (open Finder/System Settings, relaunch, reset). Packaged with electron-builder. |
| `@bluebubbles/ui` | The **renderer** — a React + Mantine SPA built with Vite. It runs "as a browser pointed at localhost": it talks to the daemon over HTTP/Socket exactly as a phone would. |

Data flow:

```
UI (renderer)  ⇄  HTTP / Socket.IO  ⇄  bbd daemon  ⇄  chat.db · private API · FCM · tunnels
```

The Electron shell only hosts the window and the daemon process — so the eventual fully-headless
build is just "stop forking the daemon, start it as a LaunchAgent."

## Prerequisites

- **Node.js 24+** (see `.nvmrc`; the native addons — better-sqlite3, node-mac-contacts,
  node-mac-permissions — build cleanly on Node 24 LTS)
- **macOS** (the daemon reads the local Messages database and uses macOS-only native modules)
- **Git**

> Use **npm**, not Yarn — Yarn can hit native-build errors on this project.

## Development

```bash
git clone git@github.com:BlueBubblesApp/BlueBubbles-Server.git
cd BlueBubbles-Server
nvm use                                # Node 24 (optional, if you use nvm)

npm install                            # installs all workspaces; a postinstall rebuilds the
                                       # native addons against Electron's ABI

# One-time: build the two things the Electron shell expects to exist —
npm run build-ui                       # build the UI and copy it where the daemon serves it
npm run build -w @bluebubbles/bbd      # bundle the daemon the shell forks (dist/daemon-entry.cjs)

npm run start                          # launch the Electron shell (it forks the daemon and
                                       # opens a window against the locally served UI)
```

For fast UI iteration with hot-reload, run the Vite dev server on its own and point a browser at
it (it talks to a running daemon over HTTP/Socket):

```bash
npm run start -w @bluebubbles/ui       # Vite dev server on http://localhost:3000
```

### Testing the daemon

`bbd` is the package with the test suite:

```bash
npm run typecheck -w @bluebubbles/bbd
npm test -w @bluebubbles/bbd           # tsx --test over packages/bbd/test
```

### macOS 10.x note

`node-mac-permissions` is pinned to a newer release to fix a production crash on Big Sur+. If you
are building on macOS 10.x and hit issues, downgrade it locally:

```bash
npm install node-mac-permissions@2.2.0 -w @bluebubbles/server
```

## Building a release

```bash
npm run build      # builds the UI (Vite) → copies it into the shell, then builds and
                   # packages the Electron app via electron-builder
```

The packaged artifacts land in `./dist` (e.g. `Gator-<version>-arm64.dmg`). `npm run release`
additionally publishes to GitHub. Packaging configuration lives in
`packages/server/scripts/electron-builder-config.js`; the bbd daemon bundle and the native
modules it needs at runtime are shipped via `extraResources`.

## Wire protocol

The client-facing request/response envelope and event formats live in **`packages/protocol`**
(`v1`). This contract is frozen for backwards compatibility, so changes there must be additive
and non-breaking.
