import type { PrivateApiTransport, TransportResponse } from "./PrivateApiTransport";

/**
 * Shared Private-API call: requires the helper to be connected, surfaces a returned
 * error as a throw, and returns the response (whose `identifier` is the GUID ack).
 * Used by the FaceTime/FindMy services and any other action that needs the dylib.
 */
export async function callPrivateApi(
    transport: PrivateApiTransport,
    action: string,
    data: Record<string, unknown> = {}
): Promise<TransportResponse> {
    if (!transport.isConnected()) {
        throw new Error(`"${action}" requires the Private API (helper not connected)`);
    }
    const res = await transport.send({ action, data });
    if (res.error) throw new Error(res.error);
    return res;
}
