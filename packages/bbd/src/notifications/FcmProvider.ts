import { type Result, ok, err, toError } from "../core/result";
import type { NotificationProvider } from "./NotificationProvider";
import type { FcmDevice, NotificationPayload } from "./types";

/**
 * The narrow seam to firebase-admin. The actual `messaging().send(...)` call is
 * injected at composition time, so the bbd core has NO firebase-admin dependency
 * (the SDK lives only in a thin host adapter, wired when FCM is enabled). The
 * legacy data-only payload shape `{ type, data }` is preserved for wire-compat.
 */
export type FcmTransport = (
    tokens: string[],
    payload: { type: string; data: string },
    priority: "normal" | "high"
) => Promise<void>;

export class FcmProvider implements NotificationProvider<FcmDevice> {
    readonly name = "fcm" as const;
    readonly #transport: FcmTransport;

    constructor(transport: FcmTransport) {
        this.#transport = transport;
    }

    async send(device: FcmDevice, payload: NotificationPayload): Promise<Result<void, Error>> {
        try {
            await this.#transport([device.token], { type: payload.type, data: JSON.stringify(payload.data) }, payload.priority);
            return ok(undefined);
        } catch (e) {
            return err(toError(e));
        }
    }
}
