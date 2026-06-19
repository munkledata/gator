import React from 'react';
import {
    Divider,
    Stack,
    Text,
    Box,
    Flex,
    Accordion,
    Popover,
} from '@mantine/core';
import {  AiOutlineInfoCircle } from 'react-icons/ai';
import { useAppSelector } from '../../../hooks';
import { ProxySetupField } from '../../../components/fields/ProxySetupField';
import { ServerPasswordField } from '../../../components/fields/ServerPasswordField';
import { LocalPortField } from '../../../components/fields/LocalPortField';
import { UseHttpsField } from '../../../components/fields/UseHttpsField';
import { ZrokTokenField } from 'app/components/fields/ZrokTokenField';
import { ZrokReserveTunnelField } from 'app/components/fields/ZrokReserveTunnelField';
import { ZrokReservedNameField } from 'app/components/fields/ZrokReservedNameField';
import { ZrokDisableField } from 'app/components/fields/ZrokDisableField';
// import { EncryptCommunicationsField } from '../../../components/fields/EncryptCommunicationsField';


export const ConnectionSettings = (): JSX.Element => {
    const proxyService: string = (useAppSelector(state => state.config.proxy_service) ?? '').toLowerCase().replace(' ', '-');
    const zrokReserved: boolean = (useAppSelector(state => state.config.zrok_reserve_tunnel) ?? false);

    return (
        <Stack p={20}>
            <Flex direction='row' justify='flex-start' align='center'>
                <Text fz='2xl'>Connection Settings</Text>
                <Popover withArrow>
                    <Popover.Target>
                        <Box ml={8}>
                            <AiOutlineInfoCircle />
                        </Box>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Text fw={600} mb="xs">Information</Text>
                        <Box>
                            <Text>
                                These settings will determine how your clients will connect to the server
                            </Text>
                        </Box>
                    </Popover.Dropdown>
                </Popover>
            </Flex>
            <Divider orientation='horizontal' />
            <Box style={{ flex: 1 }} />
            <ProxySetupField />

            {(proxyService === 'zrok') ? (
                <>
                    <Box style={{ flex: 1 }} />
                    <ZrokTokenField />
                    <Box style={{ flex: 1 }} />
                    <ZrokReserveTunnelField />
                    {zrokReserved ? (
                        <>
                            <Box style={{ flex: 1 }} />
                            <ZrokReservedNameField />
                        </>
                    ) : null}
                    <ZrokDisableField />
                </>
            ) : null}


            <Box style={{ flex: 1 }} />
            <Divider orientation='horizontal' />
            <ServerPasswordField />
            <LocalPortField />

            <Box style={{ flex: 1 }} />
            {(['dynamic-dns', 'lan-url'].includes(proxyService)) ? (
                <Accordion multiple>
                    <Accordion.Item value="advanced-connection-settings">
                        <Accordion.Control>
                            <Box ta="left" w="15em" style={{ flex: '1' }}>
                                Advanced Connection Settings
                            </Box>
                        </Accordion.Control>
                        <Accordion.Panel pb={16}>
                            {/* <EncryptCommunicationsField />
                            <Box m={15} /> */}
                            <UseHttpsField />
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            ) : null}
        </Stack>
    );
};
