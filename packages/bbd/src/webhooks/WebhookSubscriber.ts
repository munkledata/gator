import type { Logger } from "../core/logger";
import type { WebhookDispatcher } from "../networking/webhook";
import type { WebhookStore } from "./Webhook";

/**
 * Fans a domain event out to every registered webhook whose subscription matches
 * the event type (or `"*"`). Delivery (HMAC signing, retry/backoff, SSRF allow-list)
 * is the Phase 6 {@link WebhookDispatcher}'s job.
 */
export class WebhookSubscriber {
    readonly #store: WebhookStore;
    readonly #dispatcher: WebhookDispatcher;
    readonly #logger: Logger;

    constructor(store: WebhookStore, dispatcher: WebhookDispatcher, logger: Logger) {
        this.#store = store;
        this.#dispatcher = dispatcher;
        this.#logger = logger.child({ component: "WebhookSubscriber" });
    }

    async onEvent(type: string, data: unknown): Promise<void> {
        const webhooks = await this.#store.list();
        const matching = webhooks.filter(w => w.events.includes("*") || w.events.includes(type));
        if (matching.length === 0) return;
        await Promise.all(
            matching.map(w => this.#dispatcher.dispatch({ url: w.url, secret: w.secret }, { type, data }))
        );
    }
}
