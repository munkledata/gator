import { ScheduledMessageItem } from 'app/components/tables/ScheduledMessagesTable';
import { invoke } from 'lib/apiClient';
import { MultiSelectValue } from '../types';
import { showErrorToast, showSuccessToast } from './ToastUtils';

export const getConfig = async () => {
    return await invoke('get-config');
};

export const getEnv = async () => {
    return await invoke('get-env');
};

export const getDevices = async () => {
    return await invoke('get-devices');
};

export interface FcmStatus {
    configured: boolean;
    projectId: string | null;
    clientEmail: string | null;
    /** Whether a Google OAuth client is configured (so automatic setup is available). */
    oauthClientConfigured?: boolean;
}

/** Whether the Firebase service account is configured (and, if so, which project). */
export const getFcmStatus = async (): Promise<FcmStatus> => {
    return await invoke('get-fcm-status');
};

/** Save the user's own Google OAuth client (for the automatic Firebase setup). */
export const setFcmOAuthClient = async (clientId: string, clientSecret?: string) => {
    return await invoke('set-fcm-oauth-client', { clientId, clientSecret });
};

/** Begin the automatic setup; returns the Google consent URL to open in the browser. */
export const startFirebaseSetup = async (): Promise<{ success: boolean; url?: string; message?: string }> => {
    return await invoke('start-firebase-setup');
};

export interface FirebaseSetupState {
    status: 'idle' | 'awaiting-consent' | 'provisioning' | 'completed' | 'error';
    step?: string;
    projectId?: string;
    error?: string;
}

export const getFirebaseSetupStatus = async (): Promise<FirebaseSetupState> => {
    return await invoke('get-firebase-setup-status');
};

/** Open a URL in the user's default browser (Electron host only). */
export const openExternalUrl = async (url: string) => {
    return await invoke('open-external', url);
};

export const getAlerts = async () => {
    return await invoke('get-alerts');
};

export const openLogLocation = async () => {
    return await invoke('open-log-location');
};

export const openAppLocation = async () => {
    return await invoke('open-app-location');
};

export const restartViaTerminal = async () => {
    return await invoke('restart-via-terminal');
};

export const restartServices = async () => {
    return await invoke('hot-restart');
};

export const fullRestart = async () => {
    return await invoke('full-restart');
};

export const clearDevices = async () => {
    return await invoke('purge-devices');
};

export const clearEventCache = async () => {
    return await invoke('purge-event-cache');
};

export const getPrivateApiRequirements = async () => {
    return await invoke('get-private-api-requirements');
};

export const checkPermissions = async () => {
    return await invoke('check-permissions');
};

export const getWebhooks = async () => {
    return await invoke('get-webhooks');
};

export const createWebhook = async (payload: { url: string, events: Array<MultiSelectValue> }) => {
    return await invoke('create-webhook', payload);
};

export const deleteWebhook = async ({ url = null, id = null }: { url?: string | null, id?: number | null }) => {
    return await invoke('delete-webhook', { url, id });
};

export const updateWebhook = async ({ id, url, events }: { id: number, url?: string, events?: Array<MultiSelectValue> }) => {
    return await invoke('update-webhook', { id, url, events });
};

export const reinstallHelperBundle = async () => {
    const res = await invoke('reinstall-helper-bundle');
    if (res.success) {
        showSuccessToast({
            id: 'settings',
            description: res.message
        });
    } else {
        showErrorToast({
            id: 'settings',
            description: res.message
        });
    }
};

export const syncInvokeIpc = async (event: string, data: any = null): Promise<any> => {
    return new Promise((resolve, reject) => {
        invoke(event, data).then(resolve).catch(reject);
    });
};

export const openFullDiskPrefs = async () => {
    return await invoke('open-fulldisk-preferences');
};

export const openAccessibilityPrefs = async () => {
    return await invoke('open-accessibility-preferences');
};

export const getPrivateApiStatus = async () => {
    return await invoke('get-private-api-status');
};

export const getAttachmentCacheInfo = async () => {
    return await invoke('get-attachment-cache-info');
};

export const clearAttachmentCache = async () => {
    return await invoke('clear-attachment-caches');
};

export const deleteScheduledMessage = async (id: number) => {
    return await invoke('delete-scheduled-message', id);
};

export const deleteScheduledMessages = async () => {
    return await invoke('delete-scheduled-messages');
};

export const createScheduledMessage = async (message: ScheduledMessageItem) => {
    return await invoke('create-scheduled-message', message);
};

export const getBinaryPath = async () => {
    return await invoke('get-binary-path');
};

export const installUpdate = async () => {
    return await invoke('install-update');
};

export const getContactsOauthUrl = async () => {
    return await invoke('get-contacts-oauth-url');
};

export const restartOauthService = async () => {
    return await invoke('restart-oauth-service');
};

export const getCurrentPermissions = async () => {
    return await invoke('get-current-permissions');
};

export const saveLanUrl = async () => {
    return await invoke('save-lan-url');
};

export const registerZrokEmail = async (email: string) => {
    return await invoke('register-zrok-email', email);
};

export const setZrokToken = async (token: string) => {
    return await invoke('set-zrok-token', token);
};

export const disableZrok = async () => {
    return await invoke('disable-zrok');
};
