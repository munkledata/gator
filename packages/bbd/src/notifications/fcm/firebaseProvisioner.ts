import type { OAuthFetch } from "./googleOAuth";

/**
 * Drives the Google Cloud / Firebase APIs to provision an FCM-ready project from an
 * OAuth access token, ending with the service-account JSON our HTTP v1 sender uses.
 *
 * Faithful to the legacy server's sequence, trimmed to what FCM v1 sending actually
 * needs: create (or reuse) the project → enable the management APIs → addFirebase →
 * find the auto-created `firebase-adminsdk` service account → mint a key. The old
 * extras (Firestore database/rules, the google-services.json Android app config) are
 * dropped — none are required to send a notification.
 *
 * Everything is fetch-injected and the inter-poll wait is injectable, so the request
 * sequence unit-tests without real network or real time.
 */

const CRM = "https://cloudresourcemanager.googleapis.com/v1";
const SU = "https://serviceusage.googleapis.com/v1";
const FB = "https://firebase.googleapis.com/v1beta1";
const IAM = "https://iam.googleapis.com/v1";

/** APIs the project needs enabled before addFirebase + key minting. */
const REQUIRED_SERVICES = [
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "iam.googleapis.com"
];

export type ProvisionProgress = (step: string) => void;

export interface ProvisionerDeps {
    accessToken: string;
    fetch: OAuthFetch;
    /** Display name for the project (also the projectId stem), e.g. "Gator". */
    projectName: string;
    onProgress?: ProvisionProgress;
    /** Wait between operation polls (default real). Tests pass a no-op. */
    sleep?: (ms: number) => Promise<void>;
    /** 4-char projectId suffix (default random). Injectable for deterministic tests. */
    suffix?: () => string;
    /** Max poll attempts per long-running operation. */
    pollAttempts?: number;
    pollDelayMs?: number;
}

export interface ProvisionResult {
    projectId: string;
    /** The Firebase service-account JSON (project_id, client_email, private_key, …). */
    serviceAccount: Record<string, unknown>;
}

const realSleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const randomSuffix = (): string => Math.random().toString(36).slice(2, 6);

export async function provisionFirebase(deps: ProvisionerDeps): Promise<ProvisionResult> {
    const fetch = deps.fetch;
    const sleep = deps.sleep ?? realSleep;
    const suffix = deps.suffix ?? randomSuffix;
    const attempts = deps.pollAttempts ?? 60;
    const delayMs = deps.pollDelayMs ?? 5000;
    const progress = (s: string): void => deps.onProgress?.(s);

    const api = async (method: string, url: string, body?: unknown): Promise<any> => {
        const res = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${deps.accessToken}`, "Content-Type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const text = await res.text().catch(() => "");
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}${text ? `: ${text}` : ""}`);
        return json;
    };

    // Poll a long-running operation resource until done:true (CRM/serviceusage/firebase).
    const pollOperation = async (opUrl: string): Promise<any> => {
        for (let i = 0; i < attempts; i++) {
            const op = await api("GET", opUrl);
            if (op.done === true) {
                if (op.error) throw new Error(`operation failed: ${JSON.stringify(op.error)}`);
                return op.response ?? op;
            }
            await sleep(delayMs);
        }
        throw new Error(`operation timed out: ${opUrl}`);
    };

    // 1) Reuse an existing active project of this name, else create one.
    progress(`Looking for an existing "${deps.projectName}" project…`);
    const filter = encodeURIComponent(`name:${deps.projectName} AND lifecycleState:ACTIVE`);
    const existing = await api("GET", `${CRM}/projects?filter=${filter}`);
    let projectId: string | undefined = (existing.projects ?? [])[0]?.projectId;

    if (!projectId) {
        projectId = `${deps.projectName.toLowerCase()}-${suffix()}`;
        progress(`Creating project "${projectId}"…`);
        const op = await api("POST", `${CRM}/projects`, { name: deps.projectName, projectId });
        await pollOperation(`${CRM}/${op.name}`);
    }

    // 2) Enable the required management APIs.
    for (const service of REQUIRED_SERVICES) {
        progress(`Enabling ${service}…`);
        const op = await api("POST", `${SU}/projects/${projectId}/services/${service}:enable`);
        if (op.name) await pollOperation(`${SU}/${op.name}`);
    }

    // 3) Add Firebase to the project (auto-creates the firebase-adminsdk service account).
    progress("Adding Firebase to the project…");
    const fbOp = await api("POST", `${FB}/projects/${projectId}:addFirebase`);
    if (fbOp.name) await pollOperation(`${FB}/${fbOp.name}`);

    // 4) Find the auto-created firebase-adminsdk service account.
    progress("Locating the Firebase service account…");
    let accountId: string | undefined;
    for (let i = 0; i < attempts; i++) {
        const list = await api("GET", `${IAM}/projects/${projectId}/serviceAccounts`);
        accountId = (list.accounts ?? []).find((a: any) => String(a.displayName ?? "").includes("firebase-adminsdk"))?.uniqueId;
        if (accountId) break;
        await sleep(delayMs);
    }
    if (!accountId) throw new Error("Firebase service account was not created in time");

    // 5) Mint a fresh key, clearing any prior user-managed keys.
    progress("Generating a service-account key…");
    const keysUrl = `${IAM}/projects/${projectId}/serviceAccounts/${accountId}/keys`;
    const keyList = await api("GET", keysUrl);
    for (const key of (keyList.keys ?? []).filter((k: any) => k.keyType === "USER_MANAGED")) {
        await api("DELETE", `${IAM}/${key.name}`);
    }
    const created = await api("POST", keysUrl);
    const serviceAccount = JSON.parse(Buffer.from(String(created.privateKeyData), "base64").toString("utf-8"));

    progress("Done.");
    return { projectId, serviceAccount };
}
