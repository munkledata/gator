import React from 'react';
import {
    Box,
    Text,
    Stack,
    Alert
} from '@mantine/core';
import { ProxySetupField } from '../../../components/fields/ProxySetupField';
import { useAppSelector } from '../../../hooks';
import { ServerPasswordField } from '../../../components/fields/ServerPasswordField';
import { ZrokTokenField } from 'app/components/fields/ZrokTokenField';
import { ZrokReservedNameField } from 'app/components/fields/ZrokReservedNameField';
import { ZrokReserveTunnelField } from 'app/components/fields/ZrokReserveTunnelField';
import { CloudflareDdnsField } from 'app/components/fields/CloudflareDdnsField';

export const ConnectionWalkthrough = (): JSX.Element => {
    const proxyService: string = (useAppSelector(state => state.config.proxy_service) ?? '').toLowerCase().replace(' ', '-');
    const zrokReserved: boolean = (useAppSelector(state => state.config.zrok_reserve_tunnel) ?? false);

    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Connection Setup</Text>
                <Text fz='md' mt={20}>
                    In order for you to be able to connect to this BlueBubbles server from the internet, you'll need
                    to either setup a Dynamic DNS or use one of the integrated proxy services. Proxy services create
                    a tunnel from your macOS device to your BlueBubbles clients. It does this by routing all communications
                    from your BlueBubbles server, through the proxy service's servers, and to your BlueBubbles client. Without
                    this, your BlueBubbles server will only be accessible on your local network.
                </Text>
                <Text fz='md' mt={20}>
                    Now, we also do not want anyone else to be able to access your BlueBubbles server except you, so we have
                    setup password-based authentication. All clients will be required to provide the password in order to
                    interact with the BlueBubbles Server's API.
                </Text>
                <Text fz='md' mt={20}>
                    Below, you'll be asked to set a password, as well as select the proxy service that you would like to use.
                    Just note, by
                </Text>

                <Text fz='3xl' mt={20}>Configurations</Text>
                <Alert color='blue' variant='light' mt={8}>
                    You must&nbsp;<i>at minimum</i>&nbsp;set a password and a proxy service
                </Alert>

                <Stack p={20}>
                    <ServerPasswordField errorOnEmpty={true} />
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
                        </>
                    ) : null}
                    {(proxyService === 'dynamic-dns') ? (
                        <>
                            <Box style={{ flex: 1 }} />
                            <CloudflareDdnsField />
                        </>
                    ) : null}
                </Stack>
            </Box>
        </Box>
    );
};
