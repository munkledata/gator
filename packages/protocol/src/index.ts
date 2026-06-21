/**
 * @bluebubbles/protocol — shared wire contracts.
 *
 * Today this holds the frozen v1 envelope. It is also the future home of the
 * `bb-helper-proto` contract (the Zod + JSON Schema definitions the daemon and
 * the injected Obj-C helper will both consume) once the H1 transport work lands.
 */
export * as v1 from "./v1/index";
export type { ResponseFormat, ResponseError, ResponseMetadata, ValidStatus } from "./v1/envelope";
export { ResponseMessage, success, failure } from "./v1/envelope";
export type {
    MessageV1,
    ChatV1,
    HandleV1,
    AttachmentV1,
    ServerInfoV1,
    ScheduledMessageV1
} from "./v1/entities";

// bb-helper-proto — the daemon <-> injected dylib contract (Phase 5 / H1).
export * as helper from "./helper/index";
export { HELPER_PROTOCOL_VERSION } from "./helper/index";
export type { HelperHandshake, HelperRequest, HelperMessage } from "./helper/index";
