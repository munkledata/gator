import React from 'react';
import {
    Box,
    Text,
    Divider,
    Anchor
} from '@mantine/core';

export const NotificationsLayout = (): JSX.Element => {
    return (
        <Box p={32} style={{ borderRadius: 10 }}>
            <Text fz='2xl'>Notifications</Text>
            <Divider orientation='horizontal' />
            <Text fz='md' mt={20}>
                BlueBubbles delivers push notifications over <strong>UnifiedPush</strong> &mdash; a
                privacy-first, self-hostable standard. There&apos;s no Google/Firebase project to configure,
                and with a stable tunnel URL there&apos;s no server URL to sync to clients.
            </Text>
            <Text fz='md' mt={20}>
                On each device, install a UnifiedPush distributor (for example{' '}
                <Anchor href='https://ntfy.sh' target='_blank'>ntfy</Anchor>) and connect through the BlueBubbles
                app. The device registers its own push endpoint automatically and appears under{' '}
                <strong>Devices</strong> &mdash; nothing to set up on the server.
            </Text>
            <Text fz='md' mt={20}>
                <Anchor href='https://unifiedpush.org' target='_blank'>Learn more about UnifiedPush &rarr;</Anchor>
            </Text>
        </Box>
    );
};
