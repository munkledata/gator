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

contextBridge.exposeInMainWorld("bbShell", {
    invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(`shell:${channel}`, data)
});
