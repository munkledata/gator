import { Server } from "@server";
import { FCMService } from "@server/services";
import { isNotEmpty } from "@server/helpers/utils";
import { MessageBus, OutgoingEvent } from "./MessageBus";

let registered = false;

/**
 * Registers the three fan-out sinks as subscribers to {@link MessageBus}.
 *
 * This is the moved body of the legacy `Server.emitMessage()` multiplexer — the
 * same Socket.IO emit, FCM notification, and webhook dispatch, in the same order,
 * so the bytes on the wire are identical. The win is decoupling: the producer
 * (`emitMessage`) no longer knows about the sinks, and the serialize-once event
 * flows to all three.
 */
export function registerMessageSinks(): void {
    if (registered) return;
    registered = true;

    // --- Socket.IO sink ---
    MessageBus.subscribe(({ type, data, sendSocket }: OutgoingEvent) => {
        if (!sendSocket) return;
        Server().httpService?.socketServer.emit(type, data);
    });

    // --- FCM sink ---
    MessageBus.subscribe(async ({ type, data, priority, sendFcm }: OutgoingEvent) => {
        if (!sendFcm || !FCMService.getApp()) return;
        try {
            const devices = await Server().repo.devices().find();
            if (isNotEmpty(devices)) {
                const notifData = JSON.stringify(data);
                await Server().fcm?.sendNotification(
                    devices.map(device => device.identifier),
                    { type, data: notifData },
                    priority
                );
            }
        } catch (ex: any) {
            Server().logger.debug("Failed to send FCM messages!");
            Server().logger.debug(ex);
        }
    });

    // --- Webhook sink ---
    MessageBus.subscribe(({ type, data }: OutgoingEvent) => {
        Server().webhookService?.dispatch({ type, data });
    });
}
