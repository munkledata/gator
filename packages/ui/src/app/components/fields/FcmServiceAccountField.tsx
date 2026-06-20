import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Text,
    Stack,
    Group,
    Button,
    Badge
} from '@mantine/core';
import { DropZone } from '../DropZone';
import { readFile } from '../../utils/GenericUtils';
import { isValidServiceAccount } from '../../utils/FcmUtils';
import { saveFcmServiceAccount, clearFcmConfiguration } from '../../actions/FcmActions';
import { getFcmStatus, FcmStatus } from '../../utils/IpcUtils';
import { showErrorToast } from '../../utils/ToastUtils';

/**
 * The Firebase service-account uploader, shared by the Notifications settings page
 * and the setup walkthrough. Drag (or click to browse) a service-account JSON; it's
 * validated client-side, then sent to the server which persists it and enables FCM
 * HTTP v1 push. The private key never leaves the Mac.
 */
export const FcmServiceAccountField = (): JSX.Element => {
    const [status, setStatus] = useState<FcmStatus | null>(null);
    const [isDragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const refresh = (): void => {
        getFcmStatus().then(setStatus).catch(() => setStatus(null));
    };
    useEffect(refresh, []);

    const ingest = async (file: File | undefined | null): Promise<void> => {
        if (!file) return;
        const text = await readFile(file);
        if (!isValidServiceAccount(text)) {
            showErrorToast({
                id: 'fcm',
                description: 'That file is not a valid Firebase service account (need project_id, client_email, private_key).'
            });
            return;
        }
        setLoading(true);
        const ok = await saveFcmServiceAccount(JSON.parse(text));
        setLoading(false);
        if (ok) refresh();
    };

    const onDrop = (e: React.DragEvent): void => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragging(false);
        void ingest(e.dataTransfer.files?.[0]);
    };

    const onClear = async (): Promise<void> => {
        const ok = await clearFcmConfiguration();
        if (ok) refresh();
    };

    const configured = status?.configured ?? false;

    return (
        <Stack gap={16}>
            {configured ? (
                <Box
                    p={16}
                    style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
                >
                    <Group justify='space-between' align='center'>
                        <Group gap='xs'>
                            <Badge color='green' variant='light'>Configured</Badge>
                            <Stack gap={0}>
                                <Text fz='sm'><strong>Project:</strong> {status?.projectId ?? '—'}</Text>
                                <Text fz='xs' c='dimmed'>{status?.clientEmail ?? ''}</Text>
                            </Stack>
                        </Group>
                        <Button color='red' variant='light' onClick={onClear}>Clear</Button>
                    </Group>
                </Box>
            ) : null}

            <Box
                onClick={() => fileInput.current?.click()}
                onDragEnter={() => { dragCounter.current += 1; setDragging(true); }}
                onDragLeave={() => { dragCounter.current -= 1; if (dragCounter.current <= 0) setDragging(false); }}
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                style={{ cursor: 'pointer' }}
            >
                <DropZone
                    text={loading ? 'Saving…' : 'Drag your service account JSON here, or click to browse'}
                    isDragging={isDragging}
                    isLoaded={configured}
                    loadedText='Service account loaded — drop a new file to replace it'
                />
            </Box>
            <input
                ref={fileInput}
                type='file'
                accept='application/json,.json'
                style={{ display: 'none' }}
                onChange={e => { void ingest(e.target.files?.[0]); e.target.value = ''; }}
            />
        </Stack>
    );
};
