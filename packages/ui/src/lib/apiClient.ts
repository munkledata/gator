/**
 * Fetch-only API client (Phase 6).
 *
 * Replaces the legacy `ipcRenderer` calls (67 `ipcMain` handlers + the insecure
 * `nodeIntegration: true` renderer). Every former IPC call becomes a typed `fetch`
 * against the daemon's `/api/v1/admin` namespace, so the exact same UI works inside
 * an Electron window (during migration), in a phone browser, or standalone — and
 * the eventual headless extraction is nearly free.
 */

export interface Envelope<T> {
    status: number;
    message: string;
    data?: T;
    error?: { message: string; type?: string };
}

export interface ApiClientOptions {
    baseUrl: string;
    password: string;
}

export class ApiClient {
    readonly #baseUrl: string;
    readonly #password: string;

    constructor(opts: ApiClientOptions) {
        this.#baseUrl = opts.baseUrl;
        this.#password = opts.password;
    }

    #url(path: string): string {
        const url = new URL(path, this.#baseUrl);
        url.searchParams.set("password", this.#password);
        return url.toString();
    }

    async get<T>(path: string): Promise<Envelope<T>> {
        const res = await fetch(this.#url(path));
        return (await res.json()) as Envelope<T>;
    }

    async post<T>(path: string, body: unknown): Promise<Envelope<T>> {
        const res = await fetch(this.#url(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return (await res.json()) as Envelope<T>;
    }

    // Convenience wrappers for the admin surface (was ipcMain).
    serverStatus(): Promise<Envelope<{ version: string; uptimeMs: number }>> {
        return this.get("/api/v1/admin/status");
    }

    updateConfig(patch: Record<string, unknown>): Promise<Envelope<Record<string, unknown>>> {
        return this.post("/api/v1/admin/config", patch);
    }
}
