import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { ConfigService } from "../../config/ConfigService";
import type { Config } from "../../config/configSchema";
import { sanitizeConfig } from "../../config/sanitize";

const NoInput = z.object({}).passthrough();
const UpdateConfigInput = z.object({}).passthrough();

export interface AdminOperationDeps {
    configService: ConfigService;
    version: string;
    startedAt: number;
    now?: () => number;
}

/**
 * The admin surface — what the UI used to reach via 67 `ipcMain` handlers, now
 * plain operations on the unified API. Once the UI is fetch-only against
 * `/api/v1/admin`, the Electron renderer is "just a browser pointed at localhost"
 * and the `nodeIntegration: true` hole closes by construction.
 */
export function buildAdminOperations(deps: AdminOperationDeps): Operation[] {
    const now = deps.now ?? (() => Date.now());
    return [
        defineOperation({
            name: "admin-update-config",
            method: "POST",
            path: "/api/v1/admin/config",
            auth: true,
            input: UpdateConfigInput,
            summary: "Update server configuration (runs the reconcile loop)",
            handler: async (_ctx, input) => {
                const updated = await deps.configService.update(input as Partial<Config>);
                // Strip EVERY plaintext credential, not just the password (audit F9): the prior
                // `{ password, ...safe }` still returned the cloudflare/zrok tokens, the FCM
                // service-account private key, the OAuth client secret, and the VAPID private
                // key. sanitizeConfig is the one canonical strip the read path uses.
                return sanitizeConfig(updated);
            }
        }),
        defineOperation({
            name: "admin-server-status",
            method: "GET",
            path: "/api/v1/admin/status",
            auth: true,
            input: NoInput,
            summary: "Daemon status",
            handler: () => ({ version: deps.version, uptimeMs: now() - deps.startedAt })
        })
    ];
}
