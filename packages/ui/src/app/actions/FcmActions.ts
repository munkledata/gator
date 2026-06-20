import { invoke } from 'lib/apiClient';
import { showErrorToast, showSuccessToast } from '../utils/ToastUtils';

interface FcmResult {
    success: boolean;
    message?: string;
    projectId?: string | null;
    clientEmail?: string | null;
}

/**
 * Upload the Firebase service-account JSON to the server, enabling FCM HTTP v1 push.
 * The private key is persisted only on the server (config DB) and is never echoed
 * back over the authenticated API.
 */
export const saveFcmServiceAccount = async (json: Record<string, unknown>): Promise<boolean> => {
    try {
        const res = await invoke<FcmResult>('set-fcm-server', json);
        if (!res?.success) {
            showErrorToast({ id: 'fcm', description: res?.message ?? 'Failed to save the service account' });
            return false;
        }
        showSuccessToast({ id: 'fcm', description: 'Firebase service account saved — push notifications are enabled!' });
        return true;
    } catch (ex: any) {
        showErrorToast({ id: 'fcm', description: `Failed to save service account! Error: ${ex?.message ?? String(ex)}` });
        return false;
    }
};

/** Remove the stored service account and disable FCM push. */
export const clearFcmConfiguration = async (): Promise<boolean> => {
    try {
        await invoke('clear-fcm');
        showSuccessToast({ id: 'fcm', description: 'Cleared Firebase configuration.' });
        return true;
    } catch (ex: any) {
        showErrorToast({ id: 'fcm', description: `Failed to clear configuration! Error: ${ex?.message ?? String(ex)}` });
        return false;
    }
};
