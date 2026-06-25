import React, { useState, useEffect, useCallback } from 'react';
import { Box, Stack, Text, Button, Badge, Group, Anchor } from '@mantine/core';
import {
    getEnv,
    getFindMyKeysStatus,
    importFindMyKeys,
    FindMyKeysStatus
} from '../../utils/IpcUtils';
import { showSuccessToast, showErrorToast } from '../../utils/ToastUtils';

type KeyType = 'LocalStorage' | 'FMIP' | 'FMF';

const KEY_LABELS: Record<KeyType, string> = {
    LocalStorage: 'Friend Locations (LocalStorage.key)',
    FMIP: 'Devices & Items (FMIPDataManager.bplist)',
    FMF: 'Friend Names (FMFDataManager.bplist)'
};

const KeyBadge = ({
    label,
    status
}: {
    label: string;
    status?: { present: boolean; valid: boolean };
}): React.JSX.Element => {
    let color = 'red';
    let text = 'Missing';
    if (status?.present && status?.valid) {
        color = 'green';
        text = 'Imported';
    } else if (status?.present && !status?.valid) {
        color = 'orange';
        text = 'Invalid';
    }
    return (
        <Group justify='space-between' w='100%'>
            <Text size='sm'>{label}</Text>
            <Badge color={color}>{text}</Badge>
        </Group>
    );
};

/**
 * On macOS 14.4+ the Find My location caches are encrypted; reading them needs three keys the user
 * extracts once. This card shows per-key status and imports them from a chosen folder (the daemon
 * validates + copies them into the config dir).
 */
export const FindMyKeysField = (): React.JSX.Element => {
    const [env, setEnv] = useState({} as Record<string, any>);
    const [status, setStatus] = useState(null as FindMyKeysStatus | null);
    const [importing, setImporting] = useState(false);

    const refreshStatus = useCallback(async () => {
        try {
            setStatus(await getFindMyKeysStatus());
        } catch {
            setStatus(null);
        }
    }, []);

    useEffect(() => {
        getEnv().then((e) => setEnv((e ?? {}) as Record<string, any>));
        void refreshStatus();
    }, [refreshStatus]);

    // Only needed on macOS 14.4+ (where Apple started encrypting the Find My cache).
    if (!env.findmyNeedsKeys) return <></>;

    const onImport = async (): Promise<void> => {
        setImporting(true);
        try {
            const { canceled, result } = await importFindMyKeys();
            if (canceled || !result) return;

            const imported = Object.entries(result)
                .filter(([, v]) => v === 'imported')
                .map(([k]) => k);
            const failed = Object.entries(result).filter(([, v]) => v !== 'imported');

            if (imported.length > 0) {
                showSuccessToast({ description: `Imported ${imported.length} Find My key(s): ${imported.join(', ')}` });
            }
            if (failed.length > 0) {
                showErrorToast({ description: `Could not import: ${failed.map(([k, v]) => `${k} (${v})`).join(', ')}` });
            }

            await refreshStatus();
        } catch (ex: any) {
            showErrorToast({ description: `Failed to import Find My keys: ${String(ex?.message ?? ex)}` });
        } finally {
            setImporting(false);
        }
    };

    return (
        <Box mt='md'>
            <Text fw={600}>Find My Decryption Keys</Text>
            <Stack gap={4} maw='32em' mt='xs'>
                <KeyBadge label={KEY_LABELS.LocalStorage} status={status?.LocalStorage} />
                <KeyBadge label={KEY_LABELS.FMIP} status={status?.FMIP} />
                <KeyBadge label={KEY_LABELS.FMF} status={status?.FMF} />
            </Stack>
            <Button size='xs' mt='sm' loading={importing} onClick={() => void onImport()}>
                Import Keys from Folder
            </Button>
            <Text size='sm' c='dimmed' mt='sm' maw='40em'>
                On macOS 14.4+, Apple encrypts the Find My location cache. BlueBubbles needs the three
                decryption keys to read device and friend locations without code injection. Extract them with{' '}
                <Anchor href='https://github.com/manonstreet/findmy-key-extractor' target='_blank'>
                    findmy-key-extractor
                </Anchor>
                , then click the button above and select the generated <b>keys</b> folder. The keys are stable
                across reboots, so you only need to import them once.
            </Text>
        </Box>
    );
};
