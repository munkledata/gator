import React, { useRef } from 'react';
import {
    NativeSelect,
    Flex,
    Box,
    Text,
    ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { onSelectChange } from '../../actions/ConfigActions';
import { DynamicDnsDialog } from '../modals/DynamicDnsDialog';
import { AiOutlineEdit } from 'react-icons/ai';
import { BiCopy } from 'react-icons/bi';
import { setConfig } from '../../slices/ConfigSlice';
import { copyToClipboard } from '../../utils/GenericUtils';
import { saveLanUrl } from 'app/utils/IpcUtils';
import { ZrokSetupDialog } from '../modals/ZrokSetupDialog';


export interface ProxySetupFieldProps {
    helpText?: string;
    showAddress?: boolean;
}

export const ProxySetupField = ({ helpText, showAddress = true }: ProxySetupFieldProps): JSX.Element => {
    const dispatch = useAppDispatch();
    const dnsRef = useRef(null);
    const zrokRef = useRef(null);
    const proxyService: string = (useAppSelector(state => state.config.proxy_service) ?? '').toLowerCase().replace(' ', '-');
    const address: string = useAppSelector(state => state.config.server_address) ?? '';
    const port: number = useAppSelector(state => state.config.socket_port) ?? 1234;
    const [dnsModalOpen, setDnsModalOpen] = useDisclosure();
    const [zrokModalOpen, setZrokModalOpen] = useDisclosure();

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='proxy_service'>Proxy Setup</Text>
            <Flex direction='row' justify='flex-start' align='center'>
                <NativeSelect
                    id='proxy_service'
                    maw="16em"
                    mr={12}
                    value={proxyService}
                    onChange={(e: any) => {
                        if (!e.target.value || e.target.value.length === 0) return;

                        let shouldSave = true;
                        if (e.target.value === 'dynamic-dns') {
                            shouldSave = false;
                            setDnsModalOpen.open();
                        } else if (e.target.value === 'zrok') {
                            shouldSave = false;
                            setZrokModalOpen.open();
                        } else if (e.target.value === 'lan-url') {
                            saveLanUrl();
                        }

                        if (shouldSave) {
                            onSelectChange(e);
                        }
                    }}
                >
                    <option value='zrok'>Zrok (Recommended)</option>
                    <option value='dynamic-dns'>Dynamic DNS / Custom URL</option>
                    <option value='lan-url'>LAN URL</option>
                </NativeSelect>
                {(proxyService === 'dynamic-dns')
                    ? (
                        <ActionIcon
                            variant="subtle"
                            mr={12}
                            aria-label='Set address'
                            onClick={() => setDnsModalOpen.open()}
                        >
                            <AiOutlineEdit />
                        </ActionIcon>
                    ) : null}
                {(showAddress) ? (
                    <>
                        <Text fz="md" c="grey">Address: {address}</Text>
                        <ActionIcon
                            variant="subtle"
                            ml={12}
                            aria-label='Copy address'
                            onClick={() => copyToClipboard(address)}
                        >
                            <BiCopy />
                        </ActionIcon>
                    </>
                ) : null}
            </Flex>
            <Text fz="xs" c="dimmed">
                {helpText ?? 'Select a proxy service to use to make your server internet-accessible. Without one selected, your server will only be accessible on your local network'}
            </Text>

            <DynamicDnsDialog
                modalRef={dnsRef}
                onConfirm={(address) => {
                    dispatch(setConfig({ name: 'proxy_service', value: 'Dynamic DNS' }));
                    dispatch(setConfig({ name: 'server_address', value: address }));
                }}
                isOpen={dnsModalOpen}
                port={port as number}
                onClose={() => setDnsModalOpen.close()}
            />

            <ZrokSetupDialog
                modalRef={zrokRef}
                onConfirm={(token: string) => {
                    dispatch(setConfig({ name: 'proxy_service', value: 'Zrok' }));
                    dispatch(setConfig({ name: 'zrok_token', value: token }));
                }}
                isOpen={zrokModalOpen}
                onClose={() => setZrokModalOpen.close()}
            />
        </Box>
    );
};