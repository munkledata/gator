# @bluebubbles/bbd — Phase 0 scaffold

`bbd` is the headless BlueBubbles daemon the legacy `@bluebubbles/server` is being
**strangled into**. This package is the Phase-0 foundation: it ships *no behavior*
yet, only the primitives and boundaries the rest of the rebuild stands on. Every
file here is dependency-free and unit-tested, so the foundation is solid before
any feature moves over.

## What's here

| Module | Replaces / fixes in the legacy server |
|---|---|
| `core/container.ts` | The global `Server()` god-object (74 files, ~25 nullable fields) → typed DI |
| `core/bus.ts` | `emitMessage()` multiplexer + duplicated `startChatListeners` fan-out → one typed `EventBus` |
| `core/logger.ts` | `Logger → Server` circular dependency → logging is an injectable interface |
| `core/disposables.ts` | Leaked timers (e.g. the never-cleared 150s `msgCheckInterval`) → tracked teardown |
| `core/lifecycle.ts` | Linear `try/catch-and-continue` startup with no rollback → ordered start + rollback |
| `core/result.ts` | Swallowed exceptions / half-initialized state → explicit `Result<T,E>` |
| `host-platform/capabilities.ts` | 65+ scattered `isMin*` version checks → one capability registry |
| `host-platform/electron-adapter.ts` | `import { app } from "electron"` everywhere → the single sanctioned Electron boundary (lint-enforced) |

`compose.ts` wires these into a container — the shape the legacy `Server()` facade
will delegate into during migration.

## The Electron boundary

`eslint.config.mjs` forbids importing `electron` anywhere except
`src/host-platform/electron-adapter.ts`. That one rule is what keeps the eventual
"de-Electron → launchd LaunchAgent" step (Phase 7) a packaging change instead of a
rewrite. The headless implementation (`HeadlessHostPlatform`) already works today.

## Logging note

The core depends on the `Logger` *interface*, not on pino. The production daemon
registers a pino-backed `Logger` in the container — same interface, no upstream
changes. Keeping the core pino-free is deliberate: it's what makes logging a seam
the UI/alerts subscribe to (via the bus) rather than something logging reaches
back into.

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm run test        # node:test via tsx
npm run lint        # eslint (incl. the Electron-boundary rule)
```

## Next (Phase 1+)

`Server()` becomes a thin facade delegating to `composeCore()`; logging is
inverted so the UI/alerts subscribe to the bus; `emitMessage` moves onto the bus
with the three sinks (Socket.IO / FCM / webhook). The `@bluebubbles/protocol`
package gains the `bb-helper-proto` contract when the H1 transport work lands.
