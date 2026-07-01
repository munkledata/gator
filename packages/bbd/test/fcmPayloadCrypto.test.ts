import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptFcmPayload, decryptFcmPayload, FCM_ENCRYPTION_TYPE } from "../src/notifications/fcm/fcmPayloadCrypto";

test("AEAD_GCM_V1 round-trips a JSON payload", () => {
    const pw = "hunter2";
    const body = JSON.stringify({ guid: "abc", text: "hi there", n: 42 });
    const frame = encryptFcmPayload(body, pw);
    assert.equal(decryptFcmPayload(frame, pw), body);
});

test("the frame is base64, versioned, and long enough for salt+iv+tag", () => {
    const frame = encryptFcmPayload("{}", "pw");
    const buf = Buffer.from(frame, "base64");
    assert.equal(buf[0], 0x01); // version
    assert.ok(buf.length >= 1 + 16 + 12 + 16); // ver + salt + iv + tag (+ ciphertext)
    assert.equal(FCM_ENCRYPTION_TYPE, "AEAD_GCM_V1");
});

test("each encryption is unique (fresh salt + iv)", () => {
    const a = encryptFcmPayload("{}", "pw");
    const b = encryptFcmPayload("{}", "pw");
    assert.notEqual(a, b);
});

test("a wrong password fails authentication (GCM tag mismatch)", () => {
    const frame = encryptFcmPayload(JSON.stringify({ x: 1 }), "right");
    assert.throws(() => decryptFcmPayload(frame, "wrong"));
});

test("a tampered ciphertext fails authentication", () => {
    const frame = encryptFcmPayload(JSON.stringify({ x: 1 }), "pw");
    const buf = Buffer.from(frame, "base64");
    const last = buf.length - 1;
    buf.writeUInt8(buf.readUInt8(last) ^ 0xff, last); // flip a ciphertext byte
    assert.throws(() => decryptFcmPayload(buf.toString("base64"), "pw"));
});
