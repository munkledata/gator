import { test } from "node:test";
import assert from "node:assert/strict";
import { isInsecurePublicUrl, assertSecureServerAddress } from "../src/config/serverAddress";

test("https public URLs are allowed", () => {
    assert.equal(isInsecurePublicUrl("https://my.ddns.net:1234"), false);
    assert.equal(isInsecurePublicUrl("https://bluebubbles.example.com"), false);
});

test("http public URLs are rejected", () => {
    assert.equal(isInsecurePublicUrl("http://my.ddns.net:1234"), true);
    assert.equal(isInsecurePublicUrl("http://1.2.3.4:1234"), true);
    assert.equal(isInsecurePublicUrl("http://not a url"), true);
});

test("http loopback / private-LAN URLs are allowed (the LAN-URL case)", () => {
    assert.equal(isInsecurePublicUrl("http://localhost:1234"), false);
    assert.equal(isInsecurePublicUrl("http://127.0.0.1:1234"), false);
    assert.equal(isInsecurePublicUrl("http://192.168.1.50:1234"), false);
    assert.equal(isInsecurePublicUrl("http://10.0.0.5:1234"), false);
    assert.equal(isInsecurePublicUrl("http://172.16.4.2:1234"), false);
});

test("non-address values are ignored", () => {
    assert.equal(isInsecurePublicUrl(undefined), false);
    assert.equal(isInsecurePublicUrl(""), false);
    assert.equal(isInsecurePublicUrl("https://x"), false);
});

test("assertSecureServerAddress throws only for insecure public URLs", () => {
    assert.throws(() => assertSecureServerAddress("http://public.example.com"));
    assert.doesNotThrow(() => assertSecureServerAddress("https://public.example.com"));
    assert.doesNotThrow(() => assertSecureServerAddress("http://localhost:1234"));
});
