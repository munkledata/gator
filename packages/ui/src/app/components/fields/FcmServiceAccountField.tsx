import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Text,
    Stack,
    Group,
    Button,
    Badge,
    Divider,
    TextInput,
    Anchor,
    Alert,
    Loader,
    List
} from '@mantine/core';
import { DropZone } from '../DropZone';
import { readFile } from '../../utils/GenericUtils';
import { isValidServiceAccount } from '../../utils/FcmUtils';
import { saveFcmServiceAccount, clearFcmConfiguration } from '../../actions/FcmActions';
import {
    getFcmStatus,
    FcmStatus,
    setFcmOAuthClient,
    startFirebaseSetup,
    getFirebaseSetupStatus,
    openExternalUrl,
    FirebaseSetupState
} from '../../utils/IpcUtils';
import { showErrorToast } from '../../utils/ToastUtils';
import { onEvent, offEvent } from 'lib/apiClient';

/**
 * Firebase setup, shared by the Notifications settings page and the walkthrough.
 * Two paths: automatic (sign into Google with your own OAuth client — creates the
 * project + service account for you) and manual (drag-and-drop a service-account
 * JSON). Both end with the same stored service account that drives FCM HTTP v1.
 */
export const FcmServiceAccountField = (): JSX.Element => {
    const [status, setStatus] = useState<FcmStatus | null>(null);
    const [setup, setSetup] = useState<FirebaseSetupState>({ status: 'idle' });
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [savingClient, setSavingClient] = useState(false);
    const [editingClient, setEditingClient] = useState(false);

    // Manual upload state
    const [isDragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const refresh = (): void => {
        getFcmStatus().then(setStatus).catch(() => setStatus(null));
    };

    useEffect(() => {
        refresh();
        getFirebaseSetupStatus().then(setSetup).catch(() => undefined);
        const handler = (s: FirebaseSetupState): void => {
            setSetup(s);
            if (s.status === 'completed') refresh();
        };
        onEvent('firebase-setup-status', handler);
        return () => offEvent('firebase-setup-status', handler);
    }, []);

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

    const saveClient = async (): Promise<void> => {
        if (!clientId.trim()) return;
        setSavingClient(true);
        await setFcmOAuthClient(clientId.trim(), clientSecret.trim() || undefined);
        setSavingClient(false);
        setEditingClient(false);
        refresh();
    };

    const startAuto = async (): Promise<void> => {
        setSetup({ status: 'awaiting-consent', step: 'Opening Google sign-in in your browser…' });
        const res = await startFirebaseSetup();
        if (!res.success || !res.url) {
            showErrorToast({ id: 'fcm', description: res.message ?? 'Failed to start automatic setup.' });
            setSetup({ status: 'idle' });
            return;
        }
        // Open in the system browser via the Electron shell; fall back to a new tab
        // if we're running in a plain browser without the shell bridge.
        try {
            await openExternalUrl(res.url);
        } catch {
            window.open(res.url, '_blank');
        }
    };

    const onClear = async (): Promise<void> => {
        const ok = await clearFcmConfiguration();
        if (ok) refresh();
    };

    const configured = status?.configured ?? false;
    const oauthReady = status?.oauthClientConfigured ?? false;
    const busy = setup.status === 'awaiting-consent' || setup.status === 'provisioning';
    const showClientForm = !oauthReady || editingClient;

    return (
        <Stack gap={20}>
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

            {/* Automatic setup */}
            <Box>
                <Text fw={600} mb={4}>Set up automatically</Text>
                <Text fz='sm' c='dimmed' mb={12}>
                    Sign into Google and Gator will create the Firebase project and service account for you.
                    This uses your own Google OAuth client, so nothing is shared with anyone else.
                </Text>

                {showClientForm ? (
                    <Box
                        p={16}
                        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
                    >
                        <Text fz='sm' mb={8}>
                            One-time: create an OAuth client in the{' '}
                            <Anchor href='https://console.cloud.google.com/apis/credentials' target='_blank'>Google Cloud Console</Anchor>:
                        </Text>
                        <List size='sm' mb={12} spacing={2}>
                            <List.Item><strong>Create Credentials → OAuth client ID</strong></List.Item>
                            <List.Item>Application type: <strong>Desktop app</strong></List.Item>
                            <List.Item>Paste the resulting <strong>Client ID</strong> below</List.Item>
                        </List>
                        <TextInput
                            label='OAuth Client ID'
                            placeholder='xxxxxx. apps.googleusercontent.com'
                            value={clientId}
                            onChange={e => setClientId(e.currentTarget.value)}
                            mb={8}
                        />
                        <TextInput
                            label='Client Secret (only for "Web application" clients)'
                            placeholder='optional'
                            value={clientSecret}
                            onChange={e => setClientSecret(e.currentTarget.value)}
                            mb={12}
                        />
                        <Group>
                            <Button onClick={saveClient} loading={savingClient} disabled={!clientId.trim()}>Save client</Button>
                            {oauthReady ? <Button variant='subtle' onClick={() => setEditingClient(false)}>Cancel</Button> : null}
                        </Group>
                    </Box>
                ) : (
                    <Group>
                        <Button onClick={startAuto} loading={busy}>
                            {busy ? 'Setting up…' : 'Set up automatically with Google'}
                        </Button>
                        <Button variant='subtle' onClick={() => { setEditingClient(true); setClientId(''); setClientSecret(''); }}>
                            Change OAuth client
                        </Button>
                    </Group>
                )}

                {busy ? (
                    <Group mt={12} gap='xs'>
                        <Loader size='sm' />
                        <Text fz='sm'>{setup.step ?? 'Working…'}</Text>
                    </Group>
                ) : null}
                {setup.status === 'error' ? (
                    <Alert color='red' variant='light' mt={12} title='Setup failed'>{setup.error}</Alert>
                ) : null}
            </Box>

            <Divider label='or upload a service account manually' labelPosition='center' />

            {/* Manual upload */}
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
