import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { FramedUdsTransport } from "../src/private-api/PrivateApiTransport";
import { encodeFrame, FrameDecoder } from "../src/private-api/framing";
import { HELPER_PROTOCOL_VERSION } from "@bluebubbles/protocol";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));

function sockPath(): string {
    return path.join(os.tmpdir(), `bbd-uds-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.sock`);
}

/** A fake injected dylib: connects, handshakes, and lets the test script its replies. */
function fakeDylib(
    socketPath: string,
    secret: string,
    onRequest: (msg: Record<string, unknown>, reply: (resp: unknown) => void) => void
): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const sock = net.connect(socketPath, () => {
            sock.write(encodeFrame({ protocolVersion: HELPER_PROTOCOL_VERSION, secret, process: "com.apple.MobileSMS" }));
        });
        const decoder = new FrameDecoder();
        sock.on("data", chunk => {
            for (const m of decoder.push(chunk)) {
                const msg = m as Record<string, unknown>;
                if (msg["event"] === "handshake-ok") {
                    resolve(sock);
                    continue;
                }
                onRequest(msg, resp => sock.write(encodeFrame(resp)));
            }
        });
        sock.on("error", reject);
    });
}

test("handshake + send + real GUID ack over a Unix-domain socket", async () => {
    const socketPath = sockPath();
    const transport = new FramedUdsTransport({ socketPath, secret: "s3cr3t", logger: silent });
    await transport.start();
    const client = await fakeDylib(socketPath, "s3cr3t", (msg, reply) => {
        if (msg["action"] === "send-message") reply({ transactionId: msg["transactionId"], identifier: "GUID-123" });
    });
    await tick();
    assert.equal(transport.isConnected(), true);
    const res = await transport.send({ action: "send-message", data: { chatGuid: "c", message: "hi" } });
    assert.equal(res.identifier, "GUID-123");
    client.destroy();
    await transport.stop();
});

test("rejects a client presenting the wrong secret", async () => {
    const socketPath = sockPath();
    const transport = new FramedUdsTransport({ socketPath, secret: "right", logger: silent });
    await transport.start();
    const sock = net.connect(socketPath, () =>
        sock.write(encodeFrame({ protocolVersion: HELPER_PROTOCOL_VERSION, secret: "wrong" }))
    );
    await tick(40);
    assert.equal(transport.isConnected(), false);
    sock.destroy();
    await transport.stop();
});

test("delivers pushed events to registered handlers", async () => {
    const socketPath = sockPath();
    const transport = new FramedUdsTransport({ socketPath, secret: "s", logger: silent });
    await transport.start();
    const events: { event: string; data: unknown }[] = [];
    transport.onEvent((event, data) => events.push({ event, data }));
    const client = await fakeDylib(socketPath, "s", () => {});
    await tick();
    client.write(encodeFrame({ event: "typing-indicator", data: { chatGuid: "c" } }));
    await tick();
    assert.equal(events.length, 1);
    assert.equal(events[0]!.event, "typing-indicator");
    client.destroy();
    await transport.stop();
});

test("send rejects when no helper is connected", async () => {
    const socketPath = sockPath();
    const transport = new FramedUdsTransport({ socketPath, secret: "s", logger: silent });
    await transport.start();
    await assert.rejects(() => transport.send({ action: "send-message" }), /not connected/);
    await transport.stop();
});
