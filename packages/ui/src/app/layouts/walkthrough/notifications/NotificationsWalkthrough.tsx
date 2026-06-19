import React from 'react';
import {
    Box,
    Text,
    Anchor
} from '@mantine/core';

export const NotificationsWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Notifications</Text>
                <Text fz='md' mt={20}>
                    BlueBubbles delivers push notifications over <strong>UnifiedPush</strong> &mdash; a
                    privacy-first, self-hostable standard. There&apos;s nothing to configure here on the
                    server, and no third-party push account to set up.
                </Text>
                <Text fz='md' mt={20}>
                    On your device, install a UnifiedPush distributor (for example{' '}
                    <Anchor href='https://ntfy.sh' target='_blank'>ntfy</Anchor>), then connect through the
                    BlueBubbles app. Your device registers its own push endpoint automatically and will
                    appear under <strong>Devices</strong>.
                </Text>
                <Text fz='md' mt={20}>
                    <Anchor href='https://unifiedpush.org' target='_blank'>Learn more about UnifiedPush &rarr;</Anchor>
                </Text>
            </Box>
        </Box>
    );
};
