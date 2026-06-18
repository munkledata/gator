import { randomUUID } from "node:crypto";

export interface Webhook {
    id: string;
    url: string;
    /** Event types to deliver, or `["*"]` for all. */
    events: string[];
    /** Optional HMAC-SHA256 signing secret. */
    secret?: string;
    createdAt: number;
}

export interface CreateWebhook {
    url: string;
    events: string[];
    secret?: string;
}

export interface WebhookStore {
    create(input: CreateWebhook): Promise<Webhook>;
    list(): Promise<Webhook[]>;
    delete(id: string): Promise<boolean>;
}

export class InMemoryWebhookStore implements WebhookStore {
    readonly #items = new Map<string, Webhook>();
    readonly #now: () => number;
    readonly #genId: () => string;

    constructor(opts: { now?: () => number; genId?: () => string } = {}) {
        this.#now = opts.now ?? (() => Date.now());
        this.#genId = opts.genId ?? randomUUID;
    }

    async create(input: CreateWebhook): Promise<Webhook> {
        const webhook: Webhook = {
            id: this.#genId(),
            url: input.url,
            events: input.events.length > 0 ? input.events : ["*"],
            createdAt: this.#now(),
            ...(input.secret != null ? { secret: input.secret } : {})
        };
        this.#items.set(webhook.id, webhook);
        return webhook;
    }

    async list(): Promise<Webhook[]> {
        return [...this.#items.values()];
    }

    async delete(id: string): Promise<boolean> {
        return this.#items.delete(id);
    }
}
