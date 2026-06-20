import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Vite is the UI build (replacing the former CRA / react-app-rewired + config-overrides.js
// setup). Output dir stays "build" so the root "build-ui" static-copy step into the server's
// dist/ is unchanged; the daemon serves the built SPA as static files. base is "./" (matching
// the old homepage:"./") — safe here because the app uses HashRouter, so the document path
// never changes and relative asset URLs always resolve.
export default defineConfig({
    plugins: [react()],
    base: "./",
    // Mirror the tsconfig `baseUrl: ./src` so `app/...` and `lib/...` imports resolve.
    resolve: {
        alias: {
            app: fileURLToPath(new URL("./src/app", import.meta.url)),
            lib: fileURLToPath(new URL("./src/lib", import.meta.url))
        }
    },
    build: { outDir: "build" },
    server: { port: 3000 }
});
