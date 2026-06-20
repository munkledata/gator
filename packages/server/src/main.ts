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
import {
    app,
    BrowserWindow,
    Tray,
    Menu,
    nativeImage,
    shell,
    ipcMain,
    dialog,
    utilityProcess,
    type UtilityProcess
} from "electron";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";

// Per-boot secret shared only between this shell and the daemon it forks (env) and
// this shell's own renderer (preload, via additionalArguments). It marks the local
// admin UI as trusted without a password — and, crucially, without trusting the
// source IP, which a same-host reverse proxy would forge for the whole internet
// (audit S1). It is never sent over HTTP, so a remote browser can't learn it.
const localAuthToken = randomBytes(32).toString("hex");

// A fatal startup failure should leave a trace instead of silently closing the app:
// append to a log the user can find, and (once Electron is ready) show a dialog.
const logStartupError = (m: string): void => {
    try {
        fs.appendFileSync(path.join(app.getPath("logs"), "startup-error.log"), `[${new Date().toISOString()}] ${m}\n`);
    } catch {
        /* noop */
    }
};
process.on("uncaughtException", e => logStartupError(`uncaughtException: ${(e as Error)?.stack ?? e}`));

// Pin the userData directory to the historical location so the existing config.db
// (server password, FCM setup, address, etc.) survives the rename to "Gator".
app.setPath("userData", path.join(app.getPath("appData"), "bluebubbles-server"));

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

/** Resolve the bundled zrok binary for this arch (used by the daemon's tunnel feature). */
const zrokBinPath = (): string | undefined => {
    const arch = process.arch === "arm64" ? "arm64" : "x86";
    const p = app.isPackaged
        ? path.join(process.resourcesPath, "appResources", "macos", "daemons", "zrok", arch, "zrok")
        : path.resolve(__dirname, "../appResources/macos/daemons/zrok", arch, "zrok");
    return fs.existsSync(p) ? p : undefined;
};

// Crash-respawn policy: a transient backend crash should self-heal, not take the whole
// app offline (audit "daemon crash kills the app"). We allow a burst of restarts with
// capped exponential backoff inside a rolling window, then give up and surface a clear
// error rather than crash-loop forever.
const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_IN_WINDOW = 5;
const BACKOFF_MS = [500, 1000, 2000, 5000, 10_000];
let recentRestarts: number[] = [];

/** Fork the daemon once; resolve on its `ready` message, reject if it dies before ready. */
function forkBackend(): Promise<number> {
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
                BBD_MESSAGES_DIR: path.join(app.getPath("home"), "Library", "Messages"),
                BBD_LOCAL_AUTH: localAuthToken,
                ...(zrokBinPath() ? { BBD_ZROK_BIN: zrokBinPath()! } : {})
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
                onUnexpectedExit(code);
            }
        });
    });
}

/** Respawn after an unexpected post-startup crash, with backoff and a crash-loop cap. */
function onUnexpectedExit(code: number | undefined): void {
    const now = Date.now();
    recentRestarts = recentRestarts.filter(t => now - t < RESTART_WINDOW_MS);
    if (recentRestarts.length >= MAX_RESTARTS_IN_WINDOW) {
        logStartupError(
            `bbd backend crashed ${recentRestarts.length}x within ${RESTART_WINDOW_MS}ms (last code ${code}); giving up`
        );
        dialog.showErrorBox(
            "Gator keeps crashing",
            "The backend exited repeatedly and could not be restarted, so the app will close. " +
                "Details were written to the startup-error.log in the app's log folder."
        );
        app.quit();
        return;
    }
    const delay = BACKOFF_MS[Math.min(recentRestarts.length, BACKOFF_MS.length - 1)]!;
    recentRestarts.push(now);
    logStartupError(`bbd backend exited (code ${code}); respawning in ${delay}ms (attempt ${recentRestarts.length})`);
    setTimeout(() => {
        if (isQuitting) return;
        forkBackend()
            .then(port => win?.loadURL(`http://localhost:${port}`))
            .catch(err => {
                logStartupError(`backend respawn failed: ${(err as Error)?.message ?? err}`);
                onUnexpectedExit(undefined);
            });
    }, delay);
}

/** Boot the backend for the first time (window creation waits on this). */
function startBackend(): Promise<number> {
    return forkBackend();
}

function createWindow(port: number): void {
    const origin = `http://localhost:${port}`;
    win = new BrowserWindow({
        width: 1100,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: "Gator Server",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            // The renderer loads a network HTTP origin, so the OS-level sandbox is a
            // load-bearing control — make it explicit, not an Electron default (audit S15).
            sandbox: true,
            preload: path.join(__dirname, "preload.js"),
            // Hand the per-boot local-trust token to the preload via argv (never over
            // HTTP); the renderer presents it as the x-bbd-local-auth header (audit S1).
            additionalArguments: [`--bbd-local-auth=${localAuthToken}`]
        }
    });
    // Keep the window pinned to the local daemon origin: deny in-app navigation and
    // window.open elsewhere, routing external links to the system browser (audit S9).
    const denyOffOrigin = (url: string): boolean => {
        try {
            return new URL(url).origin !== origin;
        } catch {
            return true;
        }
    };
    win.webContents.on("will-navigate", (evt, url) => {
        if (denyOffOrigin(url)) {
            evt.preventDefault();
            void shell.openExternal(url).catch(() => undefined);
        }
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => undefined);
        return { action: "deny" };
    });
    void win.loadURL(origin);
    win.on("closed", () => {
        win = null;
    });
}

function createTray(port: number): void {
    // The purpose-drawn gator menu-bar silhouette, as a macOS template image so it adapts
    // to the light/dark menu bar. Falls back to the app logo if the asset is missing.
    let image = nativeImage.createFromPath(path.join(uiDir(), "tray-icon-dark.png"));
    if (!image.isEmpty()) {
        image = image.resize({ width: 18, height: 18 });
        image.setTemplateImage(true);
    } else {
        image = nativeImage.createFromPath(path.join(uiDir(), "logo192.png"));
        if (!image.isEmpty()) image = image.resize({ width: 18, height: 18 });
    }
    try {
        tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    } catch {
        return; // a tray is a nicety, not a requirement
    }
    tray.setToolTip("Gator");
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: "Open Gator",
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
        // Open a URL in the user's default browser (used by the Firebase OAuth flow).
        // Only http/https — never file:// or custom app schemes that openExternal would
        // hand to an OS protocol handler from renderer-supplied input (audit S14).
        "open-external": data => {
            const url = String(data ?? "");
            if (!/^https?:\/\//i.test(url)) return { success: false, message: "Only http(s) URLs may be opened" };
            void shell.openExternal(url).catch(() => undefined);
            return { success: true };
        },
        "open-fulldisk-preferences": () => sysPref("Privacy_AllFiles"),
        "open-accessibility-preferences": () => sysPref("Privacy_Accessibility"),
        "get-binary-path": () => app.getPath("exe"),
        "restart-via-terminal": relaunch,
        "hot-restart": relaunch,
        "full-restart": relaunch,
        "install-update": () => ({ success: false, message: "Auto-update is not available in this build" }),
        "reset-app": () => {
            // Destructive: wipes the password, FCM/OAuth credentials, and all config.
            // Confirm in the main process rather than trusting the renderer (audit S15).
            const choice = dialog.showMessageBoxSync({
                type: "warning",
                buttons: ["Cancel", "Erase and restart"],
                defaultId: 0,
                cancelId: 0,
                title: "Reset Gator",
                message: "Erase all server settings?",
                detail:
                    "This deletes your password, push-notification setup, and all configuration, then restarts " +
                    "into first-run setup. This cannot be undone."
            });
            if (choice !== 1) return { success: false, message: "cancelled" };
            // Full reset: stop the daemon, wipe its persisted state, and relaunch into first-run setup.
            stopBackend();
            const userData = app.getPath("userData");
            for (const file of ["config.db", "config.db-wal", "config.db-shm", "cursor.json"]) {
                try {
                    fs.unlinkSync(path.join(userData, file));
                } catch {
                    /* noop (missing file is fine) */
                }
            }
            relaunch();
            return { success: true };
        },
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
            const msg = (err as Error)?.stack ?? String(err);
            logStartupError(`Failed to start backend: ${msg}`);
            dialog.showErrorBox(
                "Gator couldn't start",
                `The backend failed to start, so the app will close.\n\n${
                    (err as Error)?.message ?? err
                }\n\nDetails were written to the startup-error.log in the app's log folder.`
            );
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
