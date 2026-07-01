import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { FaceTimeService } from "../../facetime/FaceTimeService";

export interface FaceTimeOperationDeps {
    facetime: FaceTimeService;
}

export function buildFaceTimeOperations(deps: FaceTimeOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "answer-facetime",
            method: "POST",
            path: "/api/v1/facetime/:uuid/answer",
            auth: true,
            input: z.object({ uuid: z.string().min(1) }),
            summary: "Answer a FaceTime call (Private API)",
            handler: async (_ctx, input) => {
                await deps.facetime.answer(input.uuid);
                return { answered: true };
            }
        }),
        defineOperation({
            name: "leave-facetime",
            method: "POST",
            path: "/api/v1/facetime/:uuid/leave",
            auth: true,
            input: z.object({ uuid: z.string().min(1) }),
            summary: "Leave a FaceTime call (Private API)",
            handler: async (_ctx, input) => {
                await deps.facetime.leave(input.uuid);
                return { left: true };
            }
        }),
        defineOperation({
            name: "create-facetime-link",
            method: "POST",
            path: "/api/v1/facetime/link",
            auth: true,
            input: z.object({ addresses: z.array(z.string().min(1)).optional() }).passthrough(),
            summary: "Create a FaceTime link, optionally inviting recipients (Private API)",
            handler: (_ctx, input) => deps.facetime.createLink(input.addresses)
        }),
        defineOperation({
            name: "start-facetime",
            method: "POST",
            path: "/api/v1/facetime/call",
            auth: true,
            input: z.object({
                addresses: z.array(z.string().min(1)).min(1),
                video: z.boolean(),
                from: z.string().min(1).optional()
            }),
            summary: "Place an outgoing FaceTime call (Private API native dial)",
            handler: async (_ctx, input) => {
                const { callUuid, link } = await deps.facetime.startCall(
                    input.addresses,
                    input.video,
                    input.from
                );
                // snake_case on the wire to match the existing FaceTime client contract.
                return { call_uuid: callUuid, link };
            }
        })
    ];
}
