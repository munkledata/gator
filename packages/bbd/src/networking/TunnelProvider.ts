/**
 * Public-reachability providers.
 *
 * Collapses the legacy 4 near-duplicate proxy subclasses (ngrok/cloudflare/zrok/LAN,
 * each scraping a URL out of stdout with a regex) into one interface. The strategic
 * default is a **stable reserved hostname** — when the URL never rotates, the entire
 * republish / refresh / 20-minute-relaunch machinery (and the Firebase-as-URL-store
 * hack) simply disappears.
 */
export interface TunnelStatus {
    url: string | null;
    connected: boolean;
}

export interface TunnelProvider {
    readonly name: string;
    start(): Promise<TunnelStatus>;
    stop(): Promise<void>;
    status(): TunnelStatus;
}

/**
 * The recommended default: a fixed, reserved hostname (a named Cloudflare Tunnel,
 * a reserved ngrok domain, Tailscale Funnel, …). No rotation, nothing to scrape,
 * nothing to republish.
 */
export class StaticHostnameProvider implements TunnelProvider {
    readonly name = "static";
    readonly #hostname: string;

    constructor(hostname: string) {
        this.#hostname = hostname;
    }

    async start(): Promise<TunnelStatus> {
        return this.status();
    }

    async stop(): Promise<void> {
        /* nothing to tear down */
    }

    status(): TunnelStatus {
        return { url: this.#hostname, connected: true };
    }
}

/** Launches an underlying tunnel and yields its (possibly rotating) URL. */
export type TunnelLauncher = () => Promise<{ url: string; stop: () => Promise<void> }>;

/**
 * A managed (rotating-URL) tunnel for users who don't reserve a hostname. The
 * launcher is injected — production wraps `cloudflared --output json` / an official
 * SDK; tests pass a fake — so URL acquisition is no longer regex-scraping stdout.
 */
export class ManagedTunnelProvider implements TunnelProvider {
    readonly name: string;
    readonly #launcher: TunnelLauncher;
    #current: { url: string; stop: () => Promise<void> } | null = null;

    constructor(name: string, launcher: TunnelLauncher) {
        this.name = name;
        this.#launcher = launcher;
    }

    async start(): Promise<TunnelStatus> {
        this.#current = await this.#launcher();
        return this.status();
    }

    async stop(): Promise<void> {
        await this.#current?.stop();
        this.#current = null;
    }

    status(): TunnelStatus {
        return { url: this.#current?.url ?? null, connected: this.#current != null };
    }
}
