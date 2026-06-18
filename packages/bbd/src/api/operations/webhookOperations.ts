import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { WebhookStore } from "../../webhooks/Webhook";

export interface WebhookOperationDeps {
    store: WebhookStore;
}

const CreateInput = z.object({
    url: z.string().url(),
    events: z.array(z.string()).optional(),
    secret: z.string().optional()
});

export function buildWebhookOperations(deps: WebhookOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "create-webhook",
            method: "POST",
            path: "/api/v1/webhook",
            auth: true,
            input: CreateInput,
            summary: "Register a webhook",
            handler: (_ctx, input) =>
                deps.store.create({ url: input.url, events: input.events ?? [], secret: input.secret })
        }),
        defineOperation({
            name: "list-webhooks",
            method: "GET",
            path: "/api/v1/webhook",
            auth: true,
            input: z.object({}).passthrough(),
            summary: "List webhooks",
            handler: async () => ({ webhooks: await deps.store.list() })
        }),
        defineOperation({
            name: "delete-webhook",
            method: "DELETE",
            path: "/api/v1/webhook/:id",
            auth: true,
            input: z.object({ id: z.string().min(1) }),
            summary: "Delete a webhook",
            handler: async (_ctx, input) => ({ removed: await deps.store.delete(input.id) })
        })
    ];
}
