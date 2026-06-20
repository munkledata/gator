/**
 * Preload bridge for the bbd-backed window.
 *
 * The renderer runs with contextIsolation on and nodeIntegration off (it's "just a
 * browser pointed at localhost"), so it can't touch Electron directly. This exposes a
 * single, minimal `window.bbShell.invoke(channel)` for the few genuinely host-side
 * actions — opening Finder/System Settings, relaunching, installing an update — that
 * the backend can't perform. Everything else goes over HTTP to the daemon.
 */
import { contextBridge, ipcRenderer } from "electron";

// The per-boot local-trust token the main process passed via webPreferences
// additionalArguments (`--bbd-local-auth=…`). Read it from argv here — it never
// travels over HTTP, so only the genuine shell renderer can present it (audit S1).
const localAuthArg = process.argv.find(a => a.startsWith("--bbd-local-auth="));
const localAuth = localAuthArg ? localAuthArg.slice("--bbd-local-auth=".length) : undefined;

contextBridge.exposeInMainWorld("bbShell", {
    invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(`shell:${channel}`, data),
    localAuth
});
