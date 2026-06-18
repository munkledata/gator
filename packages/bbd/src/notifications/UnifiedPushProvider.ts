import { type Result, ok, err, toError } from "../core/result";
import type { NotificationProvider } from "./NotificationProvider";
import type { NotificationPayload, UnifiedPushDevice } from "./types";

/**
 * Minimal `fetch` shape, declared locally so the package needs no DOM lib types.
 * Node 22's global `fetch` satisfies it.
 */
export type FetchLike = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number }>;

/**
 * The default provider. UnifiedPush delivery is just an authenticated-by-URL HTTP
 * POST of the payload to the device's distributor endpoint (e.g. an ntfy URL) — no
 * Google project, no SDK, fully self-hostable. The distributor wakes the client app.
 */
export class UnifiedPushProvider implements NotificationProvider<UnifiedPushDevice> {
    readonly name = "unifiedpush" as const;
    readonly #fetch: FetchLike;

    constructor(fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike) {
        this.#fetch = fetchImpl;
    }

    async send(device: UnifiedPushDevice, payload: NotificationPayload): Promise<Result<void, Error>> {
        try {
            const res = await this.#fetch(device.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // RFC 8030 urgency; distributors that honor it can prioritize.
                    Urgency: payload.priority === "high" ? "high" : "normal"
                },
                body: JSON.stringify({ type: payload.type, data: payload.data })
            });
            if (!res.ok) {
                return err(new Error(`UnifiedPush endpoint ${device.endpoint} returned HTTP ${res.status}`));
            }
            return ok(undefined);
        } catch (e) {
            return err(toError(e));
        }
    }
}
