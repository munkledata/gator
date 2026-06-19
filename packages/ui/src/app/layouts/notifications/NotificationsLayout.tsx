import React from 'react';
import {
    Box,
    Text,
    Divider,
    Link
} from 'lib/ui';

export const NotificationsLayout = (): JSX.Element => {
    return (
        <Box p={8} borderRadius={10}>
            <Text fontSize='2xl'>Notifications</Text>
            <Divider orientation='horizontal' />
            <Text fontSize='md' mt={5}>
                BlueBubbles delivers push notifications over <strong>UnifiedPush</strong> &mdash; a
                privacy-first, self-hostable standard. There&apos;s no Google/Firebase project to configure,
                and with a stable tunnel URL there&apos;s no server URL to sync to clients.
            </Text>
            <Text fontSize='md' mt={5}>
                On each device, install a UnifiedPush distributor (for example{' '}
                <Link href='https://ntfy.sh' target='_blank'>ntfy</Link>) and connect through the BlueBubbles
                app. The device registers its own push endpoint automatically and appears under{' '}
                <strong>Devices</strong> &mdash; nothing to set up on the server.
            </Text>
            <Text fontSize='md' mt={5}>
                <Link href='https://unifiedpush.org' target='_blank'>Learn more about UnifiedPush &rarr;</Link>
            </Text>
        </Box>
    );
};
