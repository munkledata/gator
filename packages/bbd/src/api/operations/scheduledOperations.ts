import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { ScheduledMessageStore } from "../../scheduled/ScheduledMessage";

export interface ScheduledOperationDeps {
    store: ScheduledMessageStore;
}

const CreateInput = z.object({
    chatGuid: z.string().min(1),
    text: z.string().min(1),
    /** Unix ms timestamp to send at. */
    scheduledFor: z.coerce.number().int().positive()
});

export function buildScheduledOperations(deps: ScheduledOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "create-scheduled-message",
            method: "POST",
            path: "/api/v1/scheduled-message",
            auth: true,
            input: CreateInput,
            summary: "Schedule a message for a future time",
            handler: (_ctx, input) => deps.store.create(input)
        }),
        defineOperation({
            name: "list-scheduled-messages",
            method: "GET",
            path: "/api/v1/scheduled-message",
            auth: true,
            input: z.object({}).passthrough(),
            summary: "List scheduled messages",
            handler: async () => ({ scheduledMessages: await deps.store.list() })
        }),
        defineOperation({
            name: "delete-scheduled-message",
            method: "DELETE",
            path: "/api/v1/scheduled-message/:id",
            auth: true,
            input: z.object({ id: z.string().min(1) }),
            summary: "Delete a scheduled message",
            handler: async (_ctx, input) => ({ removed: await deps.store.delete(input.id) })
        })
    ];
}
