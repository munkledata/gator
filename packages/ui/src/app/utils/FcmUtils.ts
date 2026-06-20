import { hasKey, testJson } from './GenericUtils';

/**
 * Validate a Firebase **service account** JSON (the file from Firebase console →
 * Project settings → Service accounts → "Generate new private key"). This is the
 * only thing the server needs to send via FCM HTTP v1 — the legacy dual-upload flow
 * (a separate `google-services.json` client config + a Google OAuth dance) is gone.
 */
export const isValidServiceAccount = (value: string): boolean => {
    const data = testJson(value);
    if (!data) return false;
    if (!hasKey(data, 'project_id')) return false;
    if (!hasKey(data, 'client_email')) return false;
    if (!hasKey(data, 'private_key')) return false;
    return true;
};
