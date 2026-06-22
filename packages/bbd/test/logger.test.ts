import { test } from "node:test";
import assert from "node:assert/strict";
import { createConsoleLogger } from "../src/core/logger";

function capture() {
    const lines: string[] = [];
    const logger = createConsoleLogger("t", { sink: (_l, line) => lines.push(line) });
    return { logger, lines };
}

test("logger redacts secret-keyed values in structured args (audit F26)", () => {
    const { logger, lines } = capture();
    logger.info("config dump", {
        password: "super-secret",
        zrok_token: "tok-123",
        serverAddress: "https://example.com",
        notifications: {
            fcm: { serviceAccount: { private_key: "PEM-DATA", project_id: "p" } },
            webpush: { vapidPrivateKey: "PRIV", vapidPublicKey: "PUB" }
        },
        authorization: "Bearer abc"
    });
    const line = lines[0]!;
    // Secrets gone.
    assert.ok(!line.includes("super-secret"), "password value redacted");
    assert.ok(!line.includes("tok-123"), "zrok token redacted");
    assert.ok(!line.includes("PEM-DATA"), "fcm private_key redacted");
    assert.ok(!line.includes("PRIV"), "vapid private key redacted");
    assert.ok(!line.includes("Bearer abc"), "authorization redacted");
    assert.ok(line.includes("[redacted]"), "redaction placeholder present");
    // Non-secret fields preserved.
    assert.ok(line.includes("https://example.com"), "non-secret serverAddress kept");
    assert.ok(line.includes("PUB"), "vapid PUBLIC key kept");
    assert.ok(line.includes('"project_id":"p"'), "non-secret nested field kept");
});

test("logger redaction is cycle-safe and leaves primitives/strings alone", () => {
    const { logger, lines } = capture();
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj; // cycle
    logger.warn("cyclic", obj);
    assert.ok(lines[0]!.includes("[circular]"), "cycle handled without throwing");

    // A plain string message with an embedded secret is already-flattened text — documented
    // as NOT scrubbed (only structured args are). This asserts the boundary, not a regression.
    logger.info("token=plain-text-secret");
    assert.ok(lines[1]!.includes("plain-text-secret"), "string interpolation is not scrubbed (by design)");
});
