import { randomBytes } from "node:crypto";
import { generatePkce } from "../../networking/oauthPkce";
import { buildGoogleAuthUrl, exchangeCodeForToken, type OAuthFetch } from "./googleOAuth";
import { provisionFirebase } from "./firebaseProvisioner";
import type { Logger } from "../../core/logger";

/**
 * Orchestrates the automatic Firebase setup: hand the UI a Google consent URL,
 * capture the redirect (handled by the loopback /oauth/callback route), then exchange
 * the code, provision the project, and persist the resulting service account — pushing
 * status to the UI throughout. Only one flow runs at a time.
 */

export type SetupStatus = "idle" | "awaiting-consent" | "provisioning" | "completed" | "error";

export interface SetupState {
    status: SetupStatus;
    step?: string;
    projectId?: string;
    error?: string;
}

export interface FirebaseSetupDeps {
    fetch: OAuthFetch;
    /** Where Google redirects back, e.g. http://127.0.0.1:1234/oauth/callback. */
    redirectUri: string;
    /** Persist the provisioned service account (same path as set-fcm-server). */
    saveServiceAccount: (account: Record<string, unknown>) => Promise<void>;
    /** Push a state update to connected clients. */
    emit: (state: SetupState) => void;
    projectName?: string;
    logger?: Logger;
}

interface PendingFlow {
    verifier: string;
    state: string;
    clientId: string;
    clientSecret?: string;
}

export class FirebaseSetupService {
    readonly #deps: FirebaseSetupDeps;
    readonly #projectName: string;
    #state: SetupState = { status: "idle" };
    #pending: PendingFlow | null = null;

    constructor(deps: FirebaseSetupDeps) {
        this.#deps = deps;
        this.#projectName = deps.projectName ?? "Gator";
    }

    getState(): SetupState {
        return this.#state;
    }

    /** Begin a flow: returns the consent URL for the UI to open in the browser. */
    begin(opts: { clientId: string; clientSecret?: string }): { url: string } {
        if (!opts.clientId) throw new Error("A Google OAuth client ID is required");
        const { verifier, challenge } = generatePkce();
        const state = randomBytes(16).toString("base64url");
        this.#pending = { verifier, state, clientId: opts.clientId, clientSecret: opts.clientSecret };
        this.#set({ status: "awaiting-consent" });
        return {
            url: buildGoogleAuthUrl({
                clientId: opts.clientId,
                redirectUri: this.#deps.redirectUri,
                challenge,
                state
            })
        };
    }

    /** Complete a flow from the OAuth callback (code + state). */
    async complete(code: string, state: string): Promise<void> {
        const pending = this.#pending;
        if (!pending) throw new Error("No Firebase setup is in progress");
        if (!code) throw new Error("Authorization was denied or returned no code");
        if (state !== pending.state) throw new Error("OAuth state mismatch — please restart setup");
        this.#pending = null;

        try {
            this.#set({ status: "provisioning", step: "Exchanging authorization code…" });
            const accessToken = await exchangeCodeForToken({
                code,
                verifier: pending.verifier,
                clientId: pending.clientId,
                clientSecret: pending.clientSecret,
                redirectUri: this.#deps.redirectUri,
                fetch: this.#deps.fetch
            });

            const result = await provisionFirebase({
                accessToken,
                fetch: this.#deps.fetch,
                projectName: this.#projectName,
                onProgress: step => this.#set({ status: "provisioning", step })
            });

            await this.#deps.saveServiceAccount(result.serviceAccount);
            this.#set({ status: "completed", projectId: result.projectId });
        } catch (e) {
            const error = (e as Error)?.message ?? String(e);
            this.#deps.logger?.warn(`Firebase auto-setup failed: ${error}`);
            this.#set({ status: "error", error });
            throw e;
        }
    }

    /** Surface a failure that happened outside complete() (e.g. the user denied consent). */
    markError(message: string): void {
        this.#pending = null;
        this.#set({ status: "error", error: message });
    }

    #set(state: SetupState): void {
        this.#state = state;
        this.#deps.emit(state);
    }
}
