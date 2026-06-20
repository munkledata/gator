import { invoke } from 'lib/apiClient';

export const toggleTutorialCompleted = async (toggle: boolean): Promise<void> => {
    invoke('toggle-tutorial', { toggle });
};

export const resetApp = async (): Promise<void> => {
    invoke('reset-app');
};