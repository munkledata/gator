import React from 'react';
import {
    Box,
    Text,
    SlideFade,
    Link
} from 'lib/ui';

export const NotificationsWalkthrough = (): JSX.Element => {
    return (
        <SlideFade in={true} offsetY='150px'>
            <Box px={5}>
                <Text fontSize='4xl'>Notifications</Text>
                <Text fontSize='md' mt={5}>
                    BlueBubbles delivers push notifications over <strong>UnifiedPush</strong> &mdash; a
                    privacy-first, self-hostable standard. There&apos;s no Google/Firebase project to set
                    up, and nothing to configure here on the server.
                </Text>
                <Text fontSize='md' mt={5}>
                    On your device, install a UnifiedPush distributor (for example{' '}
                    <Link href='https://ntfy.sh' target='_blank'>ntfy</Link>), then connect through the
                    BlueBubbles app. Your device registers its own push endpoint automatically and will
                    appear under <strong>Devices</strong>.
                </Text>
                <Text fontSize='md' mt={5}>
                    <Link href='https://unifiedpush.org' target='_blank'>Learn more about UnifiedPush &rarr;</Link>
                </Text>
            </Box>
        </SlideFade>
    );
};
