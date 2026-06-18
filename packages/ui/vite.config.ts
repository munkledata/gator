import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phase 6: Vite replaces CRA / react-app-rewired (and the mkdir/rm/cp shell glue +
// config-overrides.js). Output dir stays "build" so the server's existing
// static-copy step is unaffected during the migration. The daemon then serves the
// built SPA as static files; the same React/Chakra app runs unchanged.
export default defineConfig({
    plugins: [react()],
    build: { outDir: "build" },
    server: { port: 3000 }
});
