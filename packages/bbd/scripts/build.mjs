import { build } from "esbuild";

/**
 * Bundles the bbd backend to CJS files the Electron shell can `utilityProcess.fork()`.
 *
 * - First-party code (bbd's own src + the `@bluebubbles/*` workspace packages, whose
 *   "main" is raw TypeScript) is bundled in, so the output is self-contained TS-free.
 * - Every other bare import (fastify, socket.io, drizzle-orm, zod, and the native
 *   addons like better-sqlite3 / node-mac-*) stays external and resolves from
 *   node_modules at runtime — bundling native `.node` or avvio's dynamic requires
 *   would break them.
 * - Output is `.cjs` (CommonJS) even though the package is `type: module`, so Node
 *   treats the forked entry as CJS regardless of the surrounding ESM package.
 */
const bundleFirstPartyExternalizeRest = {
    name: "external-except-workspace",
    setup(b) {
        b.onResolve({ filter: /^[^./]/ }, args => {
            if (args.path.startsWith("@bluebubbles/")) return undefined; // bundle workspace pkgs
            return { path: args.path, external: true };
        });
    }
};

await build({
    entryPoints: ["src/daemon-entry.ts", "src/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outdir: "dist",
    outExtension: { ".js": ".cjs" },
    sourcemap: true,
    logLevel: "info",
    // The ESM source uses `createRequire(import.meta.url)` to load native addons; in a
    // CJS bundle import.meta.url is invalid, so map it to the file's URL derived from
    // __filename (which CJS does provide).
    define: { "import.meta.url": "__bbdImportMetaUrl" },
    banner: { js: "const __bbdImportMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    plugins: [bundleFirstPartyExternalizeRest]
});

console.log("bbd backend bundled -> dist/daemon-entry.cjs, dist/main.cjs");
