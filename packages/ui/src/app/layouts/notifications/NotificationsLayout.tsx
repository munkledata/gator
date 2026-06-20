import React from 'react';
import {
    Box,
    Text,
    Divider,
    Anchor,
    List
} from '@mantine/core';
import { FcmServiceAccountField } from '../../components/fields/FcmServiceAccountField';

export const NotificationsLayout = (): JSX.Element => {
    return (
        <Box p={32}>
            <Text fz='2xl'>Notifications</Text>
            <Divider orientation='horizontal' />

            <Text fz='md' mt={20}>
                BlueBubbles delivers push notifications through <strong>Firebase Cloud Messaging</strong> using the
                modern HTTP&nbsp;v1 API. To enable it, upload your Firebase project&apos;s{' '}
                <strong>service account</strong> JSON below &mdash; that&apos;s the only thing the server needs.
                Your private key stays on this Mac and is never shared with clients.
            </Text>

            <List size='sm' mt={12} spacing={4}>
                <List.Item>
                    Create a (free) Firebase project at{' '}
                    <Anchor href='https://console.firebase.google.com' target='_blank'>console.firebase.google.com</Anchor>
                </List.Item>
                <List.Item>Open <strong>Project settings → Service accounts</strong></List.Item>
                <List.Item>Click <strong>Generate new private key</strong> and download the JSON</List.Item>
                <List.Item>Drag that file onto the box below</List.Item>
            </List>

            <Box mt={20}>
                <FcmServiceAccountField />
            </Box>

            <Text fz='sm' mt={20}>
                <Anchor href='https://docs.bluebubbles.app' target='_blank'>Learn more in the documentation &rarr;</Anchor>
            </Text>
        </Box>
    );
};
