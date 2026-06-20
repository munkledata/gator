# Contribution Guide

Contributions to Gator are welcome! Gator is a fork of BlueBubbles Server, restructured into an
npm workspace (`packages/{protocol,bbd,server,ui}`). Please follow these basics:

* Write clean, commented code
* Follow TypeScript and React best practices
* Keep the `@bluebubbles/protocol` v1 wire contract frozen — changes there must be additive and
  non-breaking (deployed clients depend on it byte-for-byte)

## Prerequisites

* **Git**
* **Node.js 24+** with **npm** (see `.nvmrc`). Use npm, not Yarn — Yarn can hit native-build
  errors on this project.
* **macOS** — the daemon reads the local Messages database and uses macOS-only native modules.
* A code editor with TypeScript, ESLint, and Prettier support (e.g. VS Code).

## Cloning & remotes

This fork lives at <https://github.com/munkledata/gator>. Fork it on GitHub, then:

```bash
git clone git@github.com:<your-username>/gator.git
cd gator
git remote add upstream git@github.com:munkledata/gator.git
git fetch upstream
```

There is **no `development` branch**. All work targets **`master`** (PRs merge into `master`).

## Building & running

```bash
npm install                            # installs all workspaces; postinstall rebuilds native addons

# One-time: build the two things the Electron shell expects to exist
npm run build-ui                       # build the UI and copy it where the daemon serves it
npm run build-bbd                      # bundle the daemon the shell forks (dist/daemon-entry.cjs)

npm run start                          # launch the Electron shell (forks the daemon, opens the UI)
```

For fast UI iteration, run the Vite dev server on its own and point a browser at it:

```bash
npm run start -w @bluebubbles/ui       # Vite dev server (talks to a running daemon)
```

## Tests, typecheck & lint

The test suite lives in `packages/bbd`. The tests load `better-sqlite3` as a native addon, so
rebuild it for your Node ABI first (the postinstall builds it against Electron's ABI):

```bash
npm rebuild better-sqlite3
npm test -w @bluebubbles/bbd
```

Typecheck and lint before opening a PR:

```bash
npm run typecheck -w @bluebubbles/bbd
npm run lint -w @bluebubbles/bbd
```

CI runs these on every pull request and on pushes to `master`.

## Submitting changes

1. Branch off `master`: `git checkout -b <your-name>/<feature>`
2. Commit with a clear message describing the problem and the fix
3. Push to your fork and open a Pull Request against `munkledata/gator` `master`
4. Include: the problem, what your change does, and how you verified it
