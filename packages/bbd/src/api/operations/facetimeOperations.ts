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
            input: z.object({}).passthrough(),
            summary: "Create a FaceTime link (Private API)",
            handler: () => deps.facetime.createLink()
        })
    ];
}
