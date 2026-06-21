import React from 'react';
import {
    Box,
    Text,
    Divider,
    Anchor
} from '@mantine/core';
import { FcmServiceAccountField } from '../../components/fields/FcmServiceAccountField';
import { WebPushField } from '../../components/fields/WebPushField';

export const NotificationsLayout = (): JSX.Element => {
    return (
        <Box p={32}>
            <Text fz='2xl'>Notifications</Text>
            <Divider orientation='horizontal' />

            <Text fz='md' mt={20} mb={20}>
                Gator delivers push notifications through <strong>Firebase Cloud Messaging</strong> (HTTP&nbsp;v1).
                Let it set up the Firebase project for you by signing into Google, or upload an existing service
                account. Either way, your private key stays on this Mac and is never shared with clients.
            </Text>

            <FcmServiceAccountField />

            <Divider orientation='horizontal' my={28} />

            <WebPushField />

            <Text fz='sm' mt={20}>
                <Anchor href='https://docs.bluebubbles.app' target='_blank'>Learn more in the documentation &rarr;</Anchor>
            </Text>
        </Box>
    );
};
