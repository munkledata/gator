import { type Result, err } from "../core/result";
import type { Logger } from "../core/logger";
import type { NotificationProvider } from "./NotificationProvider";
import type { Device, NotificationPayload, ProviderName } from "./types";

export interface DeliveryResult {
    device: Device;
    result: Result<void, Error>;
}

/**
 * Routes notifications to providers by each device's `provider` discriminator.
 *
 * This is the generalization of the legacy single FCM sink: the producer emits one
 * normalized payload, and the registry fans it out, sending each device through its
 * own provider. A device with no registered provider is logged and reported, never
 * thrown — one bad device can't break delivery to the rest.
 */
export class NotificationRegistry {
    readonly #providers = new Map<ProviderName, NotificationProvider<Device>>();
    readonly #logger: Logger;

    constructor(logger: Logger) {
        this.#logger = logger.child({ component: "NotificationRegistry" });
    }

    register<D extends Device>(provider: NotificationProvider<D>): this {
        this.#providers.set(provider.name, provider as unknown as NotificationProvider<Device>);
        return this;
    }

    has(name: ProviderName): boolean {
        return this.#providers.has(name);
    }

    providerNames(): ProviderName[] {
        return [...this.#providers.keys()];
    }

    /** Deliver a payload to many devices concurrently, routing each to its provider. */
    async dispatch(devices: readonly Device[], payload: NotificationPayload): Promise<DeliveryResult[]> {
        return Promise.all(
            devices.map(async (device): Promise<DeliveryResult> => {
                const provider = this.#providers.get(device.provider);
                if (!provider) {
                    const e = new Error(`no provider registered for "${device.provider}" (device ${device.id})`);
                    this.#logger.warn(e.message);
                    return { device, result: err(e) };
                }
                const result = await provider.send(device, payload);
                if (!result.ok) {
                    this.#logger.debug(`delivery to ${device.id} via ${device.provider} failed`, result.error);
                }
                return { device, result };
            })
        );
    }
}
