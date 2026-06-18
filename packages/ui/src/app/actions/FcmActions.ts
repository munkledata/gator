import { invoke } from 'lib/apiClient';
import { showErrorToast, showSuccessToast } from '../utils/ToastUtils';

export const clearFcmConfiguration = async (): Promise<boolean> => {
    let success = false;

    try {
        await invoke('set-fcm-client', null);
        await invoke('set-fcm-server', null);

        success = true;
        showSuccessToast({
            id: 'fcm',
            description: 'Successfully cleared FCM Configuration!'
        });
    } catch (ex: any) {
        showErrorToast({
            id: 'fcm',
            description: `Failed to clear FCM configuration! Error: ${ex?.message ?? String(ex)}`
        });
    }

    return success;
};

export const saveFcmClient = async (json: NodeJS.Dict<any>): Promise<void> => {
    await invoke('set-fcm-client', json);
    showSuccessToast({
        id: 'fcm',
        description: 'Successfully saved FCM Client Configuration!'
    });
};

export const saveFcmServer = async (json: NodeJS.Dict<any>): Promise<void> => {
    await invoke('set-fcm-server', json);
    showSuccessToast({
        id: 'fcm',
        description: 'Successfully saved FCM Server Configuration!'
    });
};