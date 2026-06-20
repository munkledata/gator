import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    TextInput,
    Switch,
    Button,
    Group,
    NumberInput,
    Code
} from '@mantine/core';
import { invoke } from 'lib/apiClient';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setConfig } from '../../slices/ConfigSlice';
import { showSuccessToast, showErrorToast } from '../../utils/ToastUtils';

/**
 * Cloudflare dynamic DNS — for a home/dynamic-IP server on a custom domain.
 * Keeps a subdomain's A record pointed at the server's current public IP via the
 * Cloudflare API. The bbd `cloudflare-ddns` service does the actual syncing; this just
 * persists its config (flat snake_case keys) and exposes a manual "update now".
 */
export const CloudflareDdnsField = (): JSX.Element => {
    const dispatch = useAppDispatch();
    const enabled: boolean = (useAppSelector(s => s.config.cloudflare_ddns_enabled) ?? false);
    const apiToken: string = (useAppSelector(s => s.config.cloudflare_ddns_api_token) ?? '');
    const record: string = (useAppSelector(s => s.config.cloudflare_ddns_record) ?? '');
    const proxied: boolean = (useAppSelector(s => s.config.cloudflare_ddns_proxied) ?? false);
    const interval: number = (useAppSelector(s => s.config.cloudflare_ddns_interval_seconds) ?? 300);

    const [token, setToken] = useState(apiToken);
    const [rec, setRec] = useState(record);
    const [publicIp, setPublicIp] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => { setToken(apiToken); }, [apiToken]);
    useEffect(() => { setRec(record); }, [record]);
    useEffect(() => {
        invoke('get-public-ip').then((r: any) => setPublicIp(r?.ip ?? null)).catch(() => undefined);
    }, []);

    const save = (name: string, value: any): void => { dispatch(setConfig({ name, value })); };

    const syncNow = async (): Promise<void> => {
        setSyncing(true);
        try {
            const r: any = await invoke('cloudflare-ddns-sync-now');
            if (r?.ip) setPublicIp(r.ip);
            if (r?.ok) {
                showSuccessToast({ id: 'ddns', duration: 5000, description: r.message ?? 'DNS record synced!' });
            } else {
                showErrorToast({ id: 'ddns', duration: 6000, description: r?.message ?? 'DNS sync failed' });
            }
        } catch (e: any) {
            showErrorToast({ id: 'ddns', duration: 6000, description: e?.message ?? 'DNS sync failed' });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <Box>
            <Switch
                checked={enabled}
                onChange={(e: any) => save('cloudflare_ddns_enabled', e.target.checked)}
                label='Keep a Cloudflare DNS record pointed at this server'
            />
            <Text fz='xs' c='dimmed' mt={4}>
                For a home / dynamic-IP server on a custom domain. Gator updates your subdomain&apos;s
                <Code>A</Code> record to this server&apos;s current public IP{publicIp ? ` (currently ${publicIp})` : ''}.
            </Text>

            {enabled ? (
                <Box mt={12}>
                    <Text component='label' fw={500} fz='sm' mb={4}>Cloudflare API Token</Text>
                    <TextInput
                        type='password'
                        maw='24em'
                        value={token}
                        placeholder='Token scoped to Zone · DNS · Edit'
                        onChange={(e: any) => setToken(e.target.value)}
                        onBlur={() => save('cloudflare_ddns_api_token', token.trim())}
                    />
                    <Text fz='xs' c='dimmed' mt={4}>
                        Create at Cloudflare → My Profile → API Tokens, scoped to <Code>Zone · DNS · Edit</Code> for your zone.
                    </Text>

                    <Text component='label' fw={500} fz='sm' mb={4} mt={12}>Subdomain</Text>
                    <TextInput
                        maw='24em'
                        value={rec}
                        placeholder='bb.example.com'
                        onChange={(e: any) => setRec(e.target.value)}
                        onBlur={() => save('cloudflare_ddns_record', rec.trim())}
                    />

                    <Group mt={12} align='flex-end'>
                        <NumberInput
                            label='Check every (seconds)'
                            maw='11em'
                            min={60}
                            value={interval}
                            onChange={(v: any) => save('cloudflare_ddns_interval_seconds', Number(v) || 300)}
                        />
                        <Switch
                            mb={8}
                            checked={proxied}
                            onChange={(e: any) => save('cloudflare_ddns_proxied', e.target.checked)}
                            label='Proxy through Cloudflare'
                        />
                    </Group>
                    <Text fz='xs' c='dimmed' mt={4}>
                        Leave the proxy off (DNS-only) so clients reach the server directly on its port —
                        Cloudflare&apos;s proxy can&apos;t forward arbitrary ports.
                    </Text>

                    <Button mt={16} variant='default' loading={syncing} onClick={() => syncNow()}>
                        Update DNS now
                    </Button>
                </Box>
            ) : null}
        </Box>
    );
};
