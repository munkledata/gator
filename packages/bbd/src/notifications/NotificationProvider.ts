import type { Result } from "../core/result";
import type { Device, NotificationPayload, ProviderName } from "./types";

/**
 * A push provider. Implementations deliver a payload to a single device of their
 * kind and report success/failure as a {@link Result} (never throw across this
 * boundary — delivery failures are routine, not exceptional).
 *
 * Providers whose SDKs are heavy (FCM's firebase-admin, web-push) take an injected
 * transport so the bbd core never imports those SDKs — the same isolation
 * discipline used for Electron. UnifiedPush needs no SDK at all (it's an HTTP POST).
 */
export interface NotificationProvider<D extends Device = Device> {
    readonly name: ProviderName;
    send(device: D, payload: NotificationPayload): Promise<Result<void, Error>>;
}
