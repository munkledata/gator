/**
 * The UI's transport to the daemon — replaces every `ipcRenderer` call.
 *
 * Two surfaces, one origin (bbd serves this bundle, so everything is same-origin):
 *   - `invoke(channel, data)` — request/response, was `ipcRenderer.invoke`. Data
 *     channels POST to the daemon's `/api/v1/admin/command` dispatcher; the handful of
 *     genuinely shell-side channels (open Finder, relaunch, install update) go to the
 *     Electron host via a tiny `window.bbShell` contextBridge.
 *   - `onEvent(event, cb)` — server pushes, was `ipcRenderer.on`. A Socket.IO
 *     subscription on the same origin.
 *
 * Auth: the local window is loopback, which the daemon trusts (see execute.ts), so no
 * password is needed here; the password still guards remote access over the tunnel.
 */
import { io, type Socket } from 'socket.io-client';

export interface Envelope<T> {
    status: number;
    message: string;
    data?: T;
    error?: { message: string; type?: string };
}

/** Channels the Electron host owns (filesystem, app lifecycle) — not the backend. */
export const SHELL_CHANNELS = new Set<string>([
    'open-log-location',
    'open-app-location',
    'open-fulldisk-preferences',
    'open-accessibility-preferences',
    'restart-via-terminal',
    'hot-restart',
    'full-restart',
    'install-update',
    'reset-app',
    'get-binary-path',
    'reinstall-helper-bundle',
    'open-external'
]);

interface BbShell {
    invoke(channel: string, data?: unknown): Promise<unknown>;
}

declare global {
    interface Window {
        bbShell?: BbShell;
    }
}

class ApiClient {
    readonly #baseUrl: string;
    #socket: Socket | null = null;

    constructor(baseUrl: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:1234') {
        this.#baseUrl = baseUrl;
    }

    async invokeHttp<T = unknown>(channel: string, data?: unknown): Promise<T> {
        const res = await fetch(new URL('/api/v1/admin/command', this.#baseUrl).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, data })
        });
        const env = (await res.json()) as Envelope<T>;
        if (env.status >= 400) throw new Error(env.error?.message ?? env.message);
        return env.data as T;
    }

    #ensureSocket(): Socket {
        if (!this.#socket) {
            this.#socket = io(this.#baseUrl, { transports: ['websocket', 'polling'], autoConnect: true });
        }
        return this.#socket;
    }

    on(event: string, cb: (data: any) => void): void {
        this.#ensureSocket().on(event, cb);
    }

    off(event: string, cb?: (data: any) => void): void {
        if (!this.#socket) return;
        if (cb) this.#socket.off(event, cb);
        else this.#socket.off(event);
    }
}

export const apiClient = new ApiClient();

/** Request/response — drop-in for `ipcRenderer.invoke(channel, data)`. */
export async function invoke<T = any>(channel: string, data?: unknown): Promise<T> {
    if (SHELL_CHANNELS.has(channel)) {
        if (!window.bbShell) throw new Error(`shell channel ${channel} unavailable (not in the Electron host)`);
        return (await window.bbShell.invoke(channel, data)) as T;
    }
    return apiClient.invokeHttp<T>(channel, data);
}

/** Server push subscription — drop-in for `ipcRenderer.on(event, cb)`. */
export function onEvent(event: string, cb: (data: any) => void): void {
    apiClient.on(event, cb);
}

export function offEvent(event: string, cb?: (data: any) => void): void {
    apiClient.off(event, cb);
}
