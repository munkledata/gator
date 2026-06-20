import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGoogleAuthUrl, exchangeCodeForToken, type OAuthFetch, type OAuthFetchResponse } from "../src/notifications/fcm/googleOAuth";
import { provisionFirebase } from "../src/notifications/fcm/firebaseProvisioner";
import { FirebaseSetupService } from "../src/notifications/fcm/FirebaseSetupService";

const jsonRes = (v: unknown): OAuthFetchResponse => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(v),
    json: async () => v
});

test("buildGoogleAuthUrl produces a PKCE code-flow consent URL", () => {
    const url = buildGoogleAuthUrl({ clientId: "CID", redirectUri: "http://127.0.0.1:1234/oauth/callback", challenge: "CHAL", state: "ST" });
    assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
    const q = new URL(url).searchParams;
    assert.equal(q.get("client_id"), "CID");
    assert.equal(q.get("redirect_uri"), "http://127.0.0.1:1234/oauth/callback");
    assert.equal(q.get("response_type"), "code");
    assert.equal(q.get("code_challenge"), "CHAL");
    assert.equal(q.get("code_challenge_method"), "S256");
    assert.equal(q.get("state"), "ST");
    assert.ok(url.includes("access_type=offline"));
    assert.ok(q.get("scope")!.includes("cloud-platform"));
});

test("exchangeCodeForToken posts the code+verifier and returns the access token; secret added only when given", async () => {
    const bodies: string[] = [];
    const fetch: OAuthFetch = async (_url, init) => {
        bodies.push(init.body ?? "");
        return jsonRes({ access_token: "ACCESS" });
    };
    const token = await exchangeCodeForToken({ code: "CODE", verifier: "VER", clientId: "CID", redirectUri: "RURI", fetch });
    assert.equal(token, "ACCESS");
    assert.ok(bodies[0]!.includes("grant_type=authorization_code"));
    assert.ok(bodies[0]!.includes("code=CODE"));
    assert.ok(bodies[0]!.includes("code_verifier=VER"));
    assert.ok(!bodies[0]!.includes("client_secret"));

    await exchangeCodeForToken({ code: "C", verifier: "V", clientId: "CID", redirectUri: "R", clientSecret: "SECRET", fetch });
    assert.ok(bodies[1]!.includes("client_secret=SECRET"));
});

test("exchangeCodeForToken throws on a non-2xx response", async () => {
    const fetch: OAuthFetch = async () => ({ ok: false, status: 400, text: async () => "bad", json: async () => ({}) });
    await assert.rejects(() => exchangeCodeForToken({ code: "c", verifier: "v", clientId: "id", redirectUri: "r", fetch }));
});

/** A fake Google that walks the whole provisioning state machine to a key. */
function googleFake() {
    const SA = { project_id: "gator-abcd", client_email: "svc@gator-abcd.iam", private_key: "PEM" };
    const calls: { method: string; url: string }[] = [];
    const fetch: OAuthFetch = async (url, init) => {
        calls.push({ method: init.method, url });
        if (url.includes("cloudresourcemanager.googleapis.com/v1/projects?filter")) return jsonRes({ projects: [] });
        if (url.endsWith("/v1/projects") && init.method === "POST") return jsonRes({ name: "operations/crm-1" });
        if (url.includes("cloudresourcemanager.googleapis.com/v1/operations/")) return jsonRes({ done: true });
        if (url.endsWith(":enable")) return jsonRes({ name: "operations/su-1" });
        if (url.includes("serviceusage.googleapis.com/v1/operations/")) return jsonRes({ done: true });
        if (url.includes(":addFirebase")) return jsonRes({ name: "operations/fb-1" });
        if (url.includes("firebase.googleapis.com/v1beta1/operations/")) return jsonRes({ done: true });
        if (url.includes("/serviceAccounts") && !url.includes("/keys")) return jsonRes({ accounts: [{ displayName: "firebase-adminsdk-x", uniqueId: "SA123" }] });
        if (url.includes("/keys") && init.method === "GET") return jsonRes({ keys: [] });
        if (url.includes("/keys") && init.method === "POST") return jsonRes({ privateKeyData: Buffer.from(JSON.stringify(SA)).toString("base64") });
        return jsonRes({});
    };
    return { calls, fetch, SA };
}

test("provisionFirebase walks create→enable→addFirebase→key and returns the service account", async () => {
    const g = googleFake();
    const steps: string[] = [];
    const result = await provisionFirebase({
        accessToken: "ACCESS",
        fetch: g.fetch,
        projectName: "Gator",
        onProgress: s => steps.push(s),
        sleep: async () => undefined,
        suffix: () => "abcd",
        pollAttempts: 3,
        pollDelayMs: 0
    });
    assert.equal(result.projectId, "gator-abcd");
    assert.deepEqual(result.serviceAccount, g.SA);
    // It created the project, enabled APIs, added Firebase, and minted a key.
    assert.ok(g.calls.some(c => c.method === "POST" && c.url.endsWith("/v1/projects")));
    assert.ok(g.calls.some(c => c.url.includes(":addFirebase")));
    assert.ok(g.calls.some(c => c.method === "POST" && c.url.includes("/keys")));
    assert.ok(steps.some(s => s.toLowerCase().includes("key")));
});

test("FirebaseSetupService: begin returns a consent URL; wrong state is rejected; happy path saves + completes", async () => {
    const g = googleFake();
    // The service's fetch handles both the token exchange and the provisioning calls.
    const fetch: OAuthFetch = async (url, init) => {
        if (url.includes("oauth2.googleapis.com/token")) return jsonRes({ access_token: "ACCESS" });
        return g.fetch(url, init);
    };
    let saved: Record<string, unknown> | null = null;
    const emitted: string[] = [];
    const svc = new FirebaseSetupService({
        fetch,
        redirectUri: "http://127.0.0.1:1234/oauth/callback",
        saveServiceAccount: async acc => { saved = acc; },
        emit: s => emitted.push(s.status),
        projectName: "Gator"
    });

    const { url } = svc.begin({ clientId: "CID" });
    assert.ok(url.includes("client_id=CID"));
    assert.equal(svc.getState().status, "awaiting-consent");
    const state = new URL(url).searchParams.get("state")!;

    // A wrong state is rejected and does NOT consume the pending flow…
    await assert.rejects(() => svc.complete("authcode", "not-the-state"));
    // …so the real callback (correct state) still completes.
    await svc.complete("authcode", state);

    assert.deepEqual(saved, g.SA);
    assert.equal(svc.getState().status, "completed");
    assert.ok(svc.getState().projectId?.startsWith("gator-")); // real random suffix
    assert.ok(emitted.includes("provisioning"));
    assert.ok(emitted.includes("completed"));
});
