import { type Result, ok, err, toError } from "../core/result";
import type { NotificationProvider } from "./NotificationProvider";
import type { NotificationPayload, WebPushDevice, WebPushSubscription } from "./types";

/**
 * The narrow seam to the `web-push` (VAPID) library, injected so the core has no
 * web-push dependency. Used by browser/PWA/desktop clients — no Google project.
 */
export type WebPushTransport = (
    subscription: WebPushSubscription,
    body: string,
    opts: { urgency: "normal" | "high" }
) => Promise<void>;

export class WebPushProvider implements NotificationProvider<WebPushDevice> {
    readonly name = "webpush" as const;
    readonly #transport: WebPushTransport;

    constructor(transport: WebPushTransport) {
        this.#transport = transport;
    }

    async send(device: WebPushDevice, payload: NotificationPayload): Promise<Result<void, Error>> {
        try {
            const body = JSON.stringify({ type: payload.type, data: payload.data });
            await this.#transport(device.subscription, body, { urgency: payload.priority });
            return ok(undefined);
        } catch (e) {
            return err(toError(e));
        }
    }
}
