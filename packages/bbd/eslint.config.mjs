// Flat ESLint config for @bluebubbles/bbd.
//
// The load-bearing rule here is the **Electron import boundary**. In the legacy
// server, `import { app } from "electron"` appears across dozens of files, which
// is exactly what fuses the backend to Electron and makes the eventual headless
// (launchd) extraction a rewrite instead of a packaging change.
//
// In bbd, ONLY `src/host-platform/electron-adapter.ts` may import "electron".
// Everything else talks to the `HostPlatform` interface. This lint rule makes
// that boundary mechanical from day one (Phase 0), so it can never erode.

import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        // Register the typescript-eslint plugin so `@typescript-eslint/*` rules (referenced
        // by inline eslint-disable comments) are defined under flat config.
        plugins: { "@typescript-eslint": tseslint.plugin },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: { sourceType: "module" }
        },
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "electron",
                            message:
                                "Do not import 'electron' here. The ONLY file allowed to import Electron is " +
                                "src/host-platform/electron-adapter.ts. Depend on the HostPlatform interface instead."
                        }
                    ]
                }
            ]
        }
    },
    {
        // The single sanctioned exception: the adapter that wraps Electron.
        files: ["src/host-platform/electron-adapter.ts"],
        rules: { "no-restricted-imports": "off" }
    }
);
