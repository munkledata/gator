/**
 * Electron shell — thin host for the bbd backend.
 *
 * The strangler migration's end state: instead of booting the `Server()` god-object,
 * this forks the headless `@bluebubbles/bbd` daemon as a child (`utilityProcess`),
 * lets it own all backend logic (the unified API, read/write paths, scheduler,
 * webhooks) and serve the bundled UI, then opens a window pointed at that local
 * server. The renderer talks to the daemon over HTTP/Socket exactly as a phone or a
 * browser would — so the eventual fully-headless extraction is just "stop forking,
 * start as a LaunchAgent."
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, utilityProcess, type UtilityProcess } from "electron";
import path from "path";
import fs from "fs";

// Preserve the historical userData directory (config.db et al. live here).
app.setPath("userData", app.getPath("userData").replace("@bluebubbles/server", "bluebubbles-server"));

let backend: UtilityProcess | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const backendEntry = (): string =>
    app.isPackaged
        ? path.join(process.resourcesPath, "bbd", "daemon-entry.cjs")
        : path.resolve(__dirname, "../../bbd/dist/daemon-entry.cjs");

/** The built UI bundle (index.html + static) sits next to this main bundle in dist/. */
const uiDir = (): string => __dirname;

function startBackend(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const entry = backendEntry();
        if (!fs.existsSync(entry)) {
            reject(new Error(`bbd backend not found at ${entry} — run "npm run build" in packages/bbd`));
            return;
        }
        backend = utilityProcess.fork(entry, [], {
            stdio: "inherit",
            env: {
                ...process.env,
                BBD_USER_DATA: app.getPath("userData"),
                BBD_UI_DIR: uiDir(),
                BBD_MESSAGES_DIR: path.join(app.getPath("home"), "Library", "Messages")
            }
        });

        let settled = false;
        backend.on("message", (msg: { type?: string; port?: number; message?: string }) => {
            if (settled) return;
            if (msg?.type === "ready" && typeof msg.port === "number") {
                settled = true;
                resolve(msg.port);
            } else if (msg?.type === "error") {
                settled = true;
                reject(new Error(msg.message ?? "backend failed to start"));
            }
        });
        backend.on("exit", code => {
            backend = null;
            if (!settled) {
                settled = true;
                reject(new Error(`bbd backend exited with code ${code} before becoming ready`));
            } else if (!isQuitting) {
                // Unexpected crash after startup — bring the app down so launchd/the user restarts it.
                app.quit();
            }
        });
    });
}

function createWindow(port: number): void {
    win = new BrowserWindow({
        width: 1100,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: "BlueBubbles",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.js")
        }
    });
    void win.loadURL(`http://localhost:${port}`);
    win.on("closed", () => {
        win = null;
    });
}

function createTray(port: number): void {
    let image = nativeImage.createFromPath(path.join(uiDir(), "logo192.png"));
    if (!image.isEmpty()) image = image.resize({ width: 18, height: 18 });
    try {
        tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    } catch {
        return; // a tray is a nicety, not a requirement
    }
    tray.setToolTip("BlueBubbles");
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: "Open BlueBubbles",
                click: () => {
                    if (win) win.show();
                    else createWindow(port);
                }
            },
            { label: "Open in Browser", click: () => void shell.openExternal(`http://localhost:${port}`) },
            { type: "separator" },
            { label: "Quit", click: () => app.quit() }
        ])
    );
}

const stopBackend = (): void => {
    if (backend) {
        backend.kill();
        backend = null;
    }
};

/** Host-side channels the renderer reaches via the `window.bbShell` preload bridge. */
function registerShellHandlers(): void {
    const sysPref = (pane: string): Promise<void> =>
        shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
    const relaunch = (): void => {
        isQuitting = true;
        stopBackend();
        app.relaunch();
        app.exit(0);
    };
    const handlers: Record<string, (data?: unknown) => unknown> = {
        "open-log-location": () => shell.openPath(app.getPath("logs")),
        "open-app-location": () => shell.showItemInFolder(app.getPath("exe")),
        "open-fulldisk-preferences": () => sysPref("Privacy_AllFiles"),
        "open-accessibility-preferences": () => sysPref("Privacy_Accessibility"),
        "get-binary-path": () => app.getPath("exe"),
        "restart-via-terminal": relaunch,
        "hot-restart": relaunch,
        "full-restart": relaunch,
        "install-update": () => ({ success: false, message: "Auto-update is not available in this build" }),
        "reset-app": () => ({ success: false, message: "Reset is not available from the UI" }),
        "reinstall-helper-bundle": () => ({ success: false, message: "Helper reinstall is not available yet" })
    };
    for (const [channel, fn] of Object.entries(handlers)) {
        ipcMain.handle(`shell:${channel}`, async (_evt, data) => fn(data));
    }
}

// Single-instance: focus the existing window instead of launching a second backend.
if (!app.requestSingleInstanceLock()) {
    app.exit(0);
} else {
    app.on("second-instance", () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            registerShellHandlers();
            const port = await startBackend();
            createWindow(port);
            createTray(port);
            app.on("activate", () => {
                if (win == null) createWindow(port);
            });
        } catch (err) {
            console.error("Failed to start BlueBubbles backend:", err);
            app.exit(1);
        }
    });
}

app.on("before-quit", () => {
    isQuitting = true;
    stopBackend();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());
