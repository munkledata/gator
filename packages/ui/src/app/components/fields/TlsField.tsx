import React, { useCallback, useEffect, useState } from 'react';
import {
    Box,
    Text,
    TextInput,
    NumberInput,
    Switch,
    Select,
    Button,
    Group,
    Code,
    Badge,
    Alert
} from '@mantine/core';
import { AiOutlineInfoCircle } from 'react-icons/ai';
import { invoke } from 'lib/apiClient';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setConfig } from '../../slices/ConfigSlice';
import { showSuccessToast, showErrorToast } from '../../utils/ToastUtils';

interface TlsStatus {
    enabled: boolean;
    port: number;
    mode: string;
    domain: string | null;
    hasCert: boolean;
    certExpiry: string | null;
    issuer: string | null;
    subjectAltName: string | null;
}

const MODE_OPTIONS = [
    { value: 'self-signed', label: 'Self-signed (quick, clients must trust it)' },
    { value: 'letsencrypt', label: "Let's Encrypt (trusted, auto-renew via Cloudflare)" },
    { value: 'custom', label: 'Custom certificate (your own cert/key files)' }
];

/** Format an ISO expiry as a friendly date + a "in N days" / "expired" hint. */
function expiryLabel(iso: string | null): { text: string; soon: boolean; expired: boolean } {
    if (!iso) return { text: 'unknown', soon: false, expired: false };
    const d = new Date(iso);
    const days = Math.round((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return {
        text: `${d.toLocaleDateString()} ${d.toLocaleTimeString()} (${days < 0 ? `${-days} days ago` : `in ${days} days`})`,
        soon: days >= 0 && days <= 14,
        expired: days < 0
    };
}

/**
 * TLS / HTTPS settings. When enabled, the daemon serves HTTPS directly on its TLS port
 * (the loopback plain-HTTP listener stays local). The cert is either self-signed, a real
 * auto-renewing Let's Encrypt cert (dns-01 via the Cloudflare token configured for DDNS),
 * or your own cert/key. Shows the certificate currently in use — domain, issuer, expiry.
 */
export const TlsField = (): JSX.Element => {
    const dispatch = useAppDispatch();
    const enabled: boolean = (useAppSelector(s => s.config.tls_enabled) ?? false);
    const mode: string = (useAppSelector(s => s.config.tls_mode) ?? 'self-signed');
    const port: number = (useAppSelector(s => s.config.tls_port) ?? 1235);
    const domain: string = (useAppSelector(s => s.config.tls_domain) ?? '');
    const acmeEmail: string = (useAppSelector(s => s.config.acme_email) ?? '');
    const acmeStaging: boolean = (useAppSelector(s => s.config.acme_staging) ?? false);
    const certPath: string = (useAppSelector(s => s.config.tls_cert_path) ?? '');
    const keyPath: string = (useAppSelector(s => s.config.tls_key_path) ?? '');

    const [domainInput, setDomainInput] = useState(domain);
    const [emailInput, setEmailInput] = useState(acmeEmail);
    const [certInput, setCertInput] = useState(certPath);
    const [keyInput, setKeyInput] = useState(keyPath);
    const [status, setStatus] = useState<TlsStatus | null>(null);
    const [issuing, setIssuing] = useState(false);

    useEffect(() => { setDomainInput(domain); }, [domain]);
    useEffect(() => { setEmailInput(acmeEmail); }, [acmeEmail]);
    useEffect(() => { setCertInput(certPath); }, [certPath]);
    useEffect(() => { setKeyInput(keyPath); }, [keyPath]);

    const refreshStatus = useCallback(async (): Promise<void> => {
        try {
            setStatus(await invoke<TlsStatus>('get-tls-status'));
        } catch {
            /* status is best-effort */
        }
    }, []);
    useEffect(() => { void refreshStatus(); }, [refreshStatus, enabled, mode]);

    const save = (name: string, value: any): void => { dispatch(setConfig({ name, value })); };

    const issueLetsEncrypt = async (): Promise<void> => {
        if (!domainInput.trim() || !emailInput.trim()) {
            showErrorToast({ id: 'tls', duration: 6000, description: 'Enter a domain and an account email first.' });
            return;
        }
        setIssuing(true);
        try {
            const r: any = await invoke('issue-letsencrypt', {
                domain: domainInput.trim(),
                email: emailInput.trim(),
                staging: acmeStaging
            });
            if (r?.success) {
                showSuccessToast({
                    id: 'tls',
                    duration: 7000,
                    description: 'Certificate issued! Restart the server to start serving HTTPS with it.'
                });
                await refreshStatus();
            } else {
                showErrorToast({ id: 'tls', duration: 9000, description: r?.message ?? 'Certificate issuance failed' });
            }
        } catch (e: any) {
            showErrorToast({ id: 'tls', duration: 9000, description: e?.message ?? 'Certificate issuance failed' });
        } finally {
            setIssuing(false);
        }
    };

    const exp = expiryLabel(status?.certExpiry ?? null);

    return (
        <Box>
            <Switch
                checked={enabled}
                onChange={(e: any) => save('tls_enabled', e.target.checked)}
                label='Serve HTTPS (TLS) for remote clients'
            />
            <Text fz='xs' c='dimmed' mt={4}>
                Lets the server terminate TLS itself on a dedicated port, so you don&apos;t need a
                separate reverse proxy. The local app keeps using plain HTTP on loopback.
            </Text>

            {enabled ? (
                <Box mt={12}>
                    <Group align='flex-end' gap='md'>
                        <Box style={{ flex: 1, minWidth: '22em' }}>
                            <Text component='label' fw={500} fz='sm' mb={4}>Certificate type</Text>
                            <Select
                                data={MODE_OPTIONS}
                                value={mode}
                                allowDeselect={false}
                                onChange={(v) => v && save('tls_mode', v)}
                            />
                        </Box>
                        <NumberInput
                            label='HTTPS port'
                            maw='9em'
                            min={1}
                            max={65535}
                            value={port}
                            onChange={(v: any) => save('tls_port', Number(v) || 1235)}
                        />
                    </Group>

                    {(mode === 'letsencrypt' || mode === 'self-signed') ? (
                        <Box mt={12}>
                            <Text component='label' fw={500} fz='sm' mb={4}>Domain</Text>
                            <TextInput
                                maw='24em'
                                value={domainInput}
                                placeholder='bb.example.com'
                                onChange={(e: any) => setDomainInput(e.target.value)}
                                onBlur={() => save('tls_domain', domainInput.trim())}
                            />
                            <Text fz='xs' c='dimmed' mt={4}>
                                The hostname clients connect to. Defaults to your server address&apos;s host if left blank.
                            </Text>
                        </Box>
                    ) : null}

                    {mode === 'letsencrypt' ? (
                        <Box mt={12}>
                            <Alert icon={<AiOutlineInfoCircle />} color='blue' variant='light' mb={12}>
                                Let&apos;s Encrypt uses the <strong>DNS-01</strong> challenge via the Cloudflare API token
                                you configured for Dynamic DNS — so it works behind NAT with no port 80. The certificate
                                auto-renews before it expires. Make sure your Cloudflare token + zone are set under
                                Dynamic DNS.
                            </Alert>
                            <Text component='label' fw={500} fz='sm' mb={4}>Account email</Text>
                            <TextInput
                                maw='24em'
                                type='email'
                                value={emailInput}
                                placeholder='you@example.com'
                                onChange={(e: any) => setEmailInput(e.target.value)}
                                onBlur={() => save('acme_email', emailInput.trim())}
                            />
                            <Switch
                                mt={12}
                                checked={acmeStaging}
                                onChange={(e: any) => save('acme_staging', e.target.checked)}
                                label='Use Let&apos;s Encrypt staging (for testing — avoids rate limits, issues untrusted certs)'
                            />
                            <Button mt={16} loading={issuing} onClick={() => issueLetsEncrypt()}>
                                {status?.hasCert && status.mode === 'letsencrypt' ? 'Renew certificate now' : 'Issue certificate'}
                            </Button>
                        </Box>
                    ) : null}

                    {mode === 'custom' ? (
                        <Box mt={12}>
                            <Text component='label' fw={500} fz='sm' mb={4}>Certificate file (PEM)</Text>
                            <TextInput
                                maw='32em'
                                value={certInput}
                                placeholder='/path/to/fullchain.pem'
                                onChange={(e: any) => setCertInput(e.target.value)}
                                onBlur={() => save('tls_cert_path', certInput.trim())}
                            />
                            <Text component='label' fw={500} fz='sm' mb={4} mt={12}>Private key file (PEM)</Text>
                            <TextInput
                                maw='32em'
                                value={keyInput}
                                placeholder='/path/to/privkey.pem'
                                onChange={(e: any) => setKeyInput(e.target.value)}
                                onBlur={() => save('tls_key_path', keyInput.trim())}
                            />
                        </Box>
                    ) : null}

                    {/* --- Certificate currently in use --- */}
                    <Box mt={20} p={12} style={{ border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8 }}>
                        <Group justify='space-between' mb={6}>
                            <Text fw={600} fz='sm'>Certificate in use</Text>
                            <Group gap={8}>
                                {status?.hasCert ? (
                                    <Badge color={exp.expired ? 'red' : exp.soon ? 'yellow' : 'green'} variant='light'>
                                        {exp.expired ? 'Expired' : exp.soon ? 'Expiring soon' : 'Valid'}
                                    </Badge>
                                ) : (
                                    <Badge color='gray' variant='light'>None yet</Badge>
                                )}
                                <Button size='xs' variant='subtle' onClick={() => void refreshStatus()}>Refresh</Button>
                            </Group>
                        </Group>
                        {status?.hasCert ? (
                            <Box>
                                <Text fz='sm'>Domain: <Code>{status.domain ?? '—'}</Code></Text>
                                <Text fz='sm'>Issuer: <Code>{status.issuer ?? '—'}</Code></Text>
                                <Text fz='sm' c={exp.expired ? 'red' : exp.soon ? 'yellow' : undefined}>
                                    Expires: {exp.text}
                                </Text>
                                {status.subjectAltName ? (
                                    <Text fz='xs' c='dimmed' mt={4}>Covers: {status.subjectAltName}</Text>
                                ) : null}
                            </Box>
                        ) : (
                            <Text fz='sm' c='dimmed'>
                                {mode === 'letsencrypt'
                                    ? 'No certificate yet — click “Issue certificate”.'
                                    : 'A certificate will be generated/loaded when the server starts.'}
                            </Text>
                        )}
                    </Box>

                    <Text fz='xs' c='dimmed' mt={12}>
                        Changes to TLS settings take effect after a server restart (issuing/renewing a Let&apos;s
                        Encrypt cert applies live if HTTPS is already running).
                    </Text>
                </Box>
            ) : null}
        </Box>
    );
};
