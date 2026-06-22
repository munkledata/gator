import { test } from "node:test";
import assert from "node:assert/strict";
import crypto, { createECDH, createHmac, createDecipheriv, createPublicKey, randomBytes } from "node:crypto";
import { encryptAes128gcm } from "../src/notifications/webpush/encrypt";
import { generateVapidKeys, vapidAuthorization } from "../src/notifications/webpush/vapid";
import { createWebPushTransport } from "../src/notifications/webpush/WebPushSender";
import { isPublicHttpUrl } from "../src/networking/webhook";
import { createConsoleLogger } from "../src/core/logger";

const silent = createConsoleLogger("t", { level: "fatal" });
const dec = (b64: string): Buffer => Buffer.from(b64, "base64url");
const hmac = (k: Buffer, d: Buffer): Buffer => createHmac("sha256", k).update(d).digest();

// ---- RFC 8291 §5 test vector ----
const V = {
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
    asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    salt: "DGv6ra1nlYgDCS1FRnbzlw",
    plaintext: "When I grow up, I want to be a watermelon",
    cek: "oIhVW04MRdy2XN9CiKLxTg",
    nonce: "4h_95klXJ5E_qnoN"
};

/** Independent RFC-8291 decrypt (receiver side), to round-trip-verify our encryption. */
function decryptAes128gcm(body: Buffer, uaPrivB64: string, authB64: string): Buffer {
    const salt = body.subarray(0, 16);
    const idlen = body.readUInt8(20);
    const asPublic = body.subarray(21, 21 + idlen);
    const payload = body.subarray(21 + idlen);

    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(dec(uaPrivB64));
    const uaPublic = ecdh.getPublicKey();
    const ecdhSecret = ecdh.computeSecret(asPublic);

    const prkKey = hmac(dec(authB64), ecdhSecret);
    const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
    const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])])).subarray(0, 32);
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
    const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);

    const tag = payload.subarray(payload.length - 16);
    const ct = payload.subarray(0, payload.length - 16);
    const d = createDecipheriv("aes-128-gcm", cek, nonce);
    d.setAuthTag(tag);
    const out = Buffer.concat([d.update(ct), d.final()]);
    let end = out.length - 1;
    while (end >= 0 && out[end] === 0) end--; // strip zero padding
    return out.subarray(0, end); // drop the 0x02 delimiter
}

test("encryptAes128gcm matches the RFC 8291 §5 key schedule (CEK/NONCE)", () => {
    const r = encryptAes128gcm(Buffer.from(V.plaintext), V.uaPublic, V.auth, {
        serverPrivateKey: dec(V.asPrivate),
        salt: dec(V.salt)
    });
    // Deriving the server public key from the vector's private key must match the vector.
    assert.equal(r.serverPublicKey.toString("base64url"), V.asPublic);
    // The content-encryption key + nonce are the authoritative interop check.
    assert.equal(r.cek.toString("base64url"), V.cek);
    assert.equal(r.nonce.toString("base64url"), V.nonce);
});

test("encrypt -> decrypt round-trips with the RFC receiver key (framing correct)", () => {
    const r = encryptAes128gcm(Buffer.from(V.plaintext), V.uaPublic, V.auth, {
        serverPrivateKey: dec(V.asPrivate),
        salt: dec(V.salt)
    });
    assert.equal(decryptAes128gcm(r.body, V.uaPrivate, V.auth).toString("utf8"), V.plaintext);
});

test("encrypt with a random ephemeral key + salt still round-trips for a fresh subscription", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const p256dh = ua.getPublicKey().toString("base64url");
    const auth = randomBytes(16).toString("base64url");
    const uaPriv = ua.getPrivateKey().toString("base64url");
    const msg = JSON.stringify({ type: "new-message", data: { guid: "g1" } });
    const r = encryptAes128gcm(Buffer.from(msg), p256dh, auth);
    assert.equal(decryptAes128gcm(r.body, uaPriv, auth).toString("utf8"), msg);
});

test("generateVapidKeys yields a 65-byte uncompressed point; vapidAuthorization signs a verifiable ES256 JWT", () => {
    const { publicKey, privateKey } = generateVapidKeys();
    const pub = dec(publicKey);
    assert.equal(pub.length, 65);
    assert.equal(pub[0], 4);

    const header = vapidAuthorization({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        subject: "mailto:me@example.com",
        publicKey,
        privateKey
    });
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    assert.ok(m, "header shape is 'vapid t=<jwt>, k=<key>'");
    assert.equal(m![2], publicKey);
    const [h, p, s] = m![1]!.split(".");
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    assert.equal(claims.aud, "https://fcm.googleapis.com");
    assert.equal(claims.sub, "mailto:me@example.com");
    assert.ok(claims.exp > Math.floor(Date.now() / 1000));

    const pubKey = createPublicKey({
        key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") },
        format: "jwk"
    });
    const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"));
    assert.ok(ok, "VAPID JWT signature verifies against the public key");
});

test("createWebPushTransport POSTs an encrypted body with VAPID + aes128gcm headers", async () => {
    let captured: any = null;
    const fetch = async (url: string, init: any) => {
        captured = { url, init };
        return { ok: true, status: 201, text: async () => "" };
    };
    const { publicKey, privateKey } = generateVapidKeys();
    const transport = createWebPushTransport({ logger: silent, fetch, vapid: () => ({ publicKey, privateKey, subject: "mailto:me@example.com" }) });

    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const sub = { endpoint: "https://push.example.com/sub/xyz", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };

    await transport(sub, JSON.stringify({ type: "new-message", data: {} }), { urgency: "high" });
    assert.equal(captured.url, sub.endpoint);
    assert.equal(captured.init.headers["Content-Encoding"], "aes128gcm");
    assert.match(captured.init.headers["Authorization"], /^vapid t=/);
    assert.equal(captured.init.headers["Urgency"], "high");
    assert.ok(captured.init.body.length > 80, "binary encrypted body present");
    // The receiver can decrypt it.
    assert.equal(
        decryptAes128gcm(Buffer.from(captured.init.body), ua.getPrivateKey().toString("base64url"), sub.keys.auth).toString("utf8"),
        JSON.stringify({ type: "new-message", data: {} })
    );
});

test("transport throws when VAPID is unconfigured and on a non-OK push response", async () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const sub = { endpoint: "https://push.example.com/s", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
    const { publicKey, privateKey } = generateVapidKeys();

    const noVapid = createWebPushTransport({ logger: silent, fetch: async () => ({ ok: true, status: 201, text: async () => "" }), vapid: () => null });
    await assert.rejects(() => noVapid(sub, "{}", { urgency: "normal" }), /not configured/);

    const gone = createWebPushTransport({ logger: silent, fetch: async () => ({ ok: false, status: 410, text: async () => "gone" }), vapid: () => ({ publicKey, privateKey, subject: "mailto:me@example.com" }) });
    await assert.rejects(() => gone(sub, "{}", { urgency: "normal" }), /HTTP 410/);
});

test("transport refuses a non-public endpoint without fetching it (audit F16 SSRF)", async () => {
    let fetched = 0;
    const { publicKey, privateKey } = generateVapidKeys();
    const transport = createWebPushTransport({
        logger: silent,
        allow: isPublicHttpUrl,
        fetch: async () => {
            fetched++;
            return { ok: true, status: 201, text: async () => "" };
        },
        vapid: () => ({ publicKey, privateKey, subject: "mailto:me@example.com" })
    });
    const localSub = { endpoint: "http://127.0.0.1:1234/api/v1/admin/command", keys: { p256dh: "x", auth: "y" } };
    await assert.rejects(() => transport(localSub, "{}", { urgency: "normal" }), /not a public http/);
    assert.equal(fetched, 0, "a non-public endpoint is never fetched");
});
