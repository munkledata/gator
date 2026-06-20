import { build } from "esbuild";

/**
 * Bundles the bbd backend to CJS files the Electron shell can `utilityProcess.fork()`.
 *
 * - Pure-JS deps (fastify, socket.io, drizzle-orm, zod, @bluebubbles/*) are bundled IN,
 *   so the packaged app only has to ship the handful of native/dynamic modules below in
 *   resources/bbd/node_modules — not bbd's whole dependency tree.
 * - Native addons and modules loaded via dynamic require/createRequire stay external:
 *   bundling a `.node` file or a runtime-resolved path is impossible.
 * - Output is `.cjs` (CommonJS) even though the package is `type: module`, so Node
 *   treats the forked entry as CJS regardless of the surrounding ESM package.
 */
const NATIVE_OR_DYNAMIC = new Set([
    "better-sqlite3",
    "node-mac-contacts",
    "node-mac-permissions",
    "bufferutil",
    "utf-8-validate"
]);
const externalizeNativeOnly = {
    name: "externalize-native-only",
    setup(b) {
        b.onResolve({ filter: /^[^./]/ }, args => {
            const top = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0];
            return NATIVE_OR_DYNAMIC.has(top) ? { path: args.path, external: true } : undefined;
        });
    }
};

await build({
    entryPoints: ["src/daemon-entry.ts", "src/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    outdir: "dist",
    outExtension: { ".js": ".cjs" },
    sourcemap: true,
    logLevel: "info",
    // The ESM source uses `createRequire(import.meta.url)` to load native addons; in a
    // CJS bundle import.meta.url is invalid, so map it to the file's URL derived from
    // __filename (which CJS does provide).
    define: { "import.meta.url": "__bbdImportMetaUrl" },
    banner: { js: "const __bbdImportMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    plugins: [externalizeNativeOnly]
});

console.log("bbd backend bundled -> dist/daemon-entry.cjs, dist/main.cjs");
