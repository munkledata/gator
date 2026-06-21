import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    Group,
    Button,
    Badge,
    TextInput,
    Code,
    CopyButton,
    Alert
} from '@mantine/core';
import { AiOutlineInfoCircle } from 'react-icons/ai';
import {
    getVapidPublicKey,
    generateVapidKeys,
    setWebPushSubject,
    disableWebPush,
    WebPushStatus
} from '../../utils/IpcUtils';
import { showSuccessToast, showErrorToast } from '../../utils/ToastUtils';

/**
 * Web Push (VAPID) — optional browser/PWA notifications that don't need Firebase.
 * Generate a VAPID key pair here; a web client subscribes with the public key
 * (applicationServerKey) and registers the subscription via POST /api/v1/devices
 * (provider "webpush"). The server holds the private key; only the public key is shown.
 */
export const WebPushField = (): JSX.Element => {
    const [status, setStatus] = useState<WebPushStatus | null>(null);
    const [subject, setSubject] = useState('');
    const [busy, setBusy] = useState(false);

    const refresh = (): void => {
        getVapidPublicKey()
            .then(s => { setStatus(s); setSubject(s.subject ?? ''); })
            .catch(() => setStatus(null));
    };
    useEffect(() => { refresh(); }, []);

    const generate = async (): Promise<void> => {
        setBusy(true);
        try {
            const r = await generateVapidKeys(subject.trim() || undefined);
            if (r.success) {
                showSuccessToast({ id: 'webpush', description: 'Web Push keys generated.' });
                refresh();
            } else {
                showErrorToast({ id: 'webpush', description: 'Failed to generate Web Push keys.' });
            }
        } catch (e: any) {
            showErrorToast({ id: 'webpush', description: e?.message ?? 'Failed to generate keys' });
        } finally {
            setBusy(false);
        }
    };

    const disable = async (): Promise<void> => {
        await disableWebPush();
        refresh();
    };

    const saveSubject = async (): Promise<void> => {
        if (!subject.trim()) return;
        try {
            await setWebPushSubject(subject.trim());
        } catch { /* non-fatal */ }
    };

    const configured = status?.configured ?? false;

    return (
        <Box>
            <Group justify='space-between' mb={6}>
                <Text fw={600}>Web Push (browser / PWA)</Text>
                <Badge color={configured ? 'green' : 'gray'} variant='light'>{configured ? 'Configured' : 'Not set up'}</Badge>
            </Group>
            <Text fz='sm' c='dimmed' mb={12}>
                Optional. Lets browser / PWA clients receive notifications without Firebase, using VAPID.
                Generate a key pair, then your web client subscribes with the public key below.
            </Text>

            <Alert icon={<AiOutlineInfoCircle />} color='blue' variant='light' mb={12}>
                Most people only need Firebase (above). Use Web Push only if you have a browser or PWA client.
            </Alert>

            <TextInput
                label='Contact subject (mailto: or https:)'
                placeholder='mailto:you@example.com'
                maw='28em'
                value={subject}
                onChange={e => setSubject(e.currentTarget.value)}
                onBlur={() => void saveSubject()}
                mb={12}
            />

            {configured && status?.publicKey ? (
                <Box mb={12}>
                    <Text component='label' fw={500} fz='sm' mb={4}>Public key (applicationServerKey)</Text>
                    <Group align='center' gap={8}>
                        <Code style={{ wordBreak: 'break-all', maxWidth: '34em' }}>{status.publicKey}</Code>
                        <CopyButton value={status.publicKey}>
                            {({ copied, copy }) => (
                                <Button size='xs' variant='light' onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
                            )}
                        </CopyButton>
                    </Group>
                </Box>
            ) : null}

            <Group>
                <Button loading={busy} onClick={() => void generate()}>
                    {configured ? 'Regenerate keys' : 'Generate VAPID keys'}
                </Button>
                {configured ? (
                    <Button variant='subtle' color='red' onClick={() => void disable()}>Disable</Button>
                ) : null}
            </Group>
            {configured ? (
                <Text fz='xs' c='dimmed' mt={8}>
                    Regenerating invalidates existing browser subscriptions — clients must re-subscribe.
                </Text>
            ) : null}
        </Box>
    );
};
