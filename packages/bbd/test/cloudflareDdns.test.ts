import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudflareDdns, type CloudflareDdnsSettings, type DdnsFetch } from "../src/networking/CloudflareDdns";

const settings = (over: Partial<CloudflareDdnsSettings> = {}): CloudflareDdnsSettings => ({
    enabled: true,
    apiToken: "tok",
    record: "bb.example.com",
    zone: "",
    proxied: false,
    intervalSeconds: 300,
    ...over
});

/** A fake Cloudflare + ipify endpoint. `recordContent: null` => the record doesn't exist yet. */
function fakeCf(opts: { publicIp: string; recordContent: string | null }) {
    const calls: { method: string; url: string; body?: any }[] = [];
    const res = (status: number, json: any) => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => json,
        text: async () => (typeof json === "string" ? json : JSON.stringify(json))
    });
    const fetch: DdnsFetch = async (url, init = {}) => {
        const method = init.method ?? "GET";
        calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
        if (url.includes("ipify")) return res(200, { ip: opts.publicIp });
        if (url.includes("/zones?name=")) return res(200, { success: true, result: [{ id: "zone1", name: "example.com" }] });
        if (url.includes("/dns_records?")) {
            const result = opts.recordContent == null ? [] : [{ id: "rec1", content: opts.recordContent }];
            return res(200, { success: true, result });
        }
        if (url.match(/\/dns_records(\/rec1)?$/)) return res(200, { success: true, result: { id: "rec1" } });
        return res(404, { success: false, errors: [{ message: "not found" }] });
    };
    return { fetch, calls };
}

test("syncOnce updates the A record when the IP changed", async () => {
    const { fetch, calls } = fakeCf({ publicIp: "203.0.113.9", recordContent: "198.51.100.1" });
    const r = await new CloudflareDdns(settings, { fetch }).syncOnce();
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    assert.equal(r.ip, "203.0.113.9");
    assert.equal(r.previous, "198.51.100.1");
    const put = calls.find(c => c.method === "PUT");
    assert.ok(put, "expected a PUT to update the record");
    assert.equal(put!.body.content, "203.0.113.9");
    assert.equal(put!.body.type, "A");
    assert.equal(put!.body.proxied, false);
});

test("syncOnce is a no-op when the record already points at the current IP", async () => {
    const { fetch, calls } = fakeCf({ publicIp: "203.0.113.9", recordContent: "203.0.113.9" });
    const r = await new CloudflareDdns(settings, { fetch }).syncOnce();
    assert.equal(r.ok, true);
    assert.equal(r.changed, false);
    assert.equal(calls.some(c => c.method === "PUT" || c.method === "POST"), false);
});

test("syncOnce creates the record when it doesn't exist yet", async () => {
    const { fetch, calls } = fakeCf({ publicIp: "203.0.113.9", recordContent: null });
    const r = await new CloudflareDdns(settings, { fetch }).syncOnce();
    assert.equal(r.changed, true);
    const post = calls.find(c => c.method === "POST");
    assert.ok(post, "expected a POST to create the record");
    assert.equal(post!.body.content, "203.0.113.9");
    assert.equal(post!.body.name, "bb.example.com");
});

test("syncOnce derives the zone from the record name", async () => {
    const { fetch, calls } = fakeCf({ publicIp: "203.0.113.9", recordContent: "1.1.1.1" });
    await new CloudflareDdns(() => settings({ zone: "" }), { fetch }).syncOnce();
    assert.ok(calls.some(c => c.url.includes("/zones?name=example.com")), "should look up zone example.com");
});

test("syncOnce skips cleanly when disabled or unconfigured", async () => {
    const { fetch } = fakeCf({ publicIp: "203.0.113.9", recordContent: "1.1.1.1" });
    assert.equal((await new CloudflareDdns(() => settings({ enabled: false }), { fetch }).syncOnce()).changed, false);
    const noTok = await new CloudflareDdns(() => settings({ apiToken: "" }), { fetch }).syncOnce();
    assert.equal(noTok.ok, false);
    assert.match(noTok.message, /token/i);
});

test("syncOnce surfaces a Cloudflare API error without throwing", async () => {
    const fetch: DdnsFetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({ success: false, errors: [{ message: "Invalid API token" }] }),
        text: async () => ""
    });
    // getPublicIp needs to succeed first; route ipify ok, zones 403.
    const f: DdnsFetch = async (url, init) =>
        url.includes("ipify")
            ? { ok: true, status: 200, json: async () => ({ ip: "203.0.113.9" }), text: async () => "" }
            : fetch(url, init);
    const r = await new CloudflareDdns(settings, { fetch: f }).syncOnce();
    assert.equal(r.ok, false);
    assert.match(r.message, /Invalid API token/);
});

test("getPublicIp falls back to the trace endpoint when ipify fails", async () => {
    const fetch: DdnsFetch = async url => {
        if (url.includes("ipify")) return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
        return { ok: true, status: 200, json: async () => ({}), text: async () => "fl=1\nip=203.0.113.42\nts=1\n" };
    };
    const ip = await new CloudflareDdns(settings, { fetch }).getPublicIp();
    assert.equal(ip, "203.0.113.42");
});
