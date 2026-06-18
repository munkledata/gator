import { EventEmitter } from "events";

/**
 * The fan-out bus for outgoing server events.
 *
 * Replaces the inline body of `Server.emitMessage()`, which hard-coded the three
 * sinks (Socket.IO, FCM, webhook) in one method. Producers now `dispatch()` a
 * normalized {@link OutgoingEvent}; sinks subscribe. New sinks can be added
 * without touching the producer, and the wire output is unchanged because the
 * sink bodies are the moved emitMessage code.
 *
 * `dispatch()` awaits its sinks, preserving the legacy semantics where a caller
 * `await`-ing `emitMessage` waited for the (async) FCM send to complete.
 */

export interface OutgoingEvent {
    type: string;
    data: any;
    priority: "normal" | "high";
    sendFcm: boolean;
    sendSocket: boolean;
}

export type OutgoingSink = (event: OutgoingEvent) => void | Promise<void>;

class MessageBusImpl extends EventEmitter {
    /** Dispatch to every sink, awaiting async sinks; one failing sink can't break the others. */
    async dispatch(event: OutgoingEvent): Promise<void> {
        const sinks = this.listeners("event") as OutgoingSink[];
        await Promise.allSettled(sinks.map(sink => Promise.resolve(sink(event))));
    }

    /** Register a sink. Returns an unsubscribe function. */
    subscribe(sink: OutgoingSink): () => void {
        this.on("event", sink);
        return () => this.off("event", sink);
    }
}

export const MessageBus = new MessageBusImpl();
MessageBus.setMaxListeners(0);
