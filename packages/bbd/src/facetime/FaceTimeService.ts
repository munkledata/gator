import type { Logger } from "../core/logger";
import type { PrivateApiTransport } from "../private-api/PrivateApiTransport";
import { callPrivateApi } from "../private-api/call";

/**
 * FaceTime control via the Private API (answer/leave a call, mint a FaceTime link).
 * All of it requires the injected helper — there's no AppleScript fallback for
 * FaceTime — so calls error cleanly when the helper isn't connected.
 */
export class FaceTimeService {
    readonly #transport: PrivateApiTransport;
    readonly #logger: Logger;

    constructor(transport: PrivateApiTransport, logger: Logger) {
        this.#transport = transport;
        this.#logger = logger.child({ component: "FaceTimeService" });
    }

    async answer(callUuid: string): Promise<void> {
        await callPrivateApi(this.#transport, "answer-facetime", { callUuid });
    }

    async leave(callUuid: string): Promise<void> {
        await callPrivateApi(this.#transport, "leave-facetime", { callUuid });
    }

    async createLink(): Promise<{ link: string | null }> {
        const res = await callPrivateApi(this.#transport, "create-facetime-link", {});
        const link = res.data?.["link"];
        return { link: typeof link === "string" ? link : null };
    }
}
