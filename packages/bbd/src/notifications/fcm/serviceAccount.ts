/**
 * The Firebase service-account credentials the FCM HTTP v1 sender needs.
 *
 * This is the JSON you download from the Firebase console
 * (Project settings → Service accounts → Generate new private key). Only three
 * fields matter for sending: the project id (the v1 endpoint path), the client
 * email (the OAuth JWT issuer), and the private key (signs that JWT). We never
 * need the legacy `google-services.json` client config — that was an Android
 * artifact the old dual-upload flow asked for needlessly.
 */
export interface FcmServiceAccount {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

/**
 * Parse a service account from either the raw JSON string or an already-parsed
 * object (the config store round-trips it as an object). Returns `null` for
 * anything that isn't a usable service account, so callers can treat "FCM not
 * configured" and "FCM misconfigured" the same safe way — never throwing.
 */
export function parseServiceAccount(input: unknown): FcmServiceAccount | null {
    let obj: Record<string, unknown> | null = null;
    if (typeof input === "string") {
        if (input.trim() === "") return null;
        try {
            obj = JSON.parse(input) as Record<string, unknown>;
        } catch {
            return null;
        }
    } else if (input && typeof input === "object") {
        obj = input as Record<string, unknown>;
    }
    if (!obj) return null;

    // Accept snake_case (the file's native shape) or camelCase (defensive).
    const projectId = obj.project_id ?? obj.projectId;
    const clientEmail = obj.client_email ?? obj.clientEmail;
    const privateKey = obj.private_key ?? obj.privateKey;

    if (typeof projectId !== "string" || !projectId) return null;
    if (typeof clientEmail !== "string" || !clientEmail) return null;
    if (typeof privateKey !== "string" || !privateKey) return null;

    return { projectId, clientEmail, privateKey };
}
