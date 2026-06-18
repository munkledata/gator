import { z } from "zod";
import { defineOperation, type Operation } from "../Operation";
import type { FindMyService } from "../../findmy/FindMyService";
import type { FindMyDevicesReader } from "../../findmy/FindMyDevicesReader";

const NoInput = z.object({}).passthrough();

export interface FindMyOperationDeps {
    findmy: FindMyService;
    devices: FindMyDevicesReader;
}

export function buildFindMyOperations(deps: FindMyOperationDeps): Operation[] {
    return [
        defineOperation({
            name: "get-findmy-friends",
            method: "GET",
            path: "/api/v1/findmy/friends",
            auth: true,
            input: NoInput,
            summary: "Cached FindMy friend locations",
            handler: () => ({ friends: deps.findmy.getFriends() })
        }),
        defineOperation({
            name: "refresh-findmy-friends",
            method: "POST",
            path: "/api/v1/findmy/friends/refresh",
            auth: true,
            input: NoInput,
            summary: "Refresh FindMy friends via the Private API",
            handler: async () => ({ friends: await deps.findmy.refreshFriends() })
        }),
        defineOperation({
            name: "get-findmy-devices",
            method: "GET",
            path: "/api/v1/findmy/devices",
            auth: true,
            input: NoInput,
            summary: "FindMy devices from the local cache",
            handler: () => ({ devices: deps.devices.read() })
        })
    ];
}
