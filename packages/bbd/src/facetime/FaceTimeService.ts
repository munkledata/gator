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

    async createLink(addresses?: string[]): Promise<{ link: string | null }> {
        // Pass recipient addresses so the helper invites them into the link (it arrives in
        // their FaceTime as an invite, not just a tappable URL). Empty → a plain link.
        const data = addresses && addresses.length > 0 ? { addresses } : {};
        const res = await callPrivateApi(this.#transport, "create-facetime-link", data);
        const link = res.data?.["link"];
        return { link: typeof link === "string" ? link : null };
    }

    /**
     * Place an OUTGOING FaceTime call (native dial) to one or more handles — the host's
     * FaceTime rings the recipient(s) from the registered identity. The dylib also mints a
     * join link bound to the placed call's conversation so the client can join the same
     * call the recipient was rung into. `link` may be null if the dial succeeded but the
     * conversation wasn't ready to mint a link yet (the client then falls back to a link).
     */
    async startCall(
        addresses: string[],
        video: boolean,
        from?: string
    ): Promise<{ callUuid: string | null; link: string | null }> {
        // `from` (optional): a local sender identity (e.g. a phone number) to ring as; the
        // dylib resolves it to a sender-identity UUID, or falls back to the default.
        const data = from ? { addresses, video, from } : { addresses, video };
        const res = await callPrivateApi(this.#transport, "start-facetime", data);
        const callUuid = res.data?.["call_uuid"];
        const link = res.data?.["link"];
        return {
            callUuid: typeof callUuid === "string" ? callUuid : null,
            link: typeof link === "string" ? link : null
        };
    }
}
