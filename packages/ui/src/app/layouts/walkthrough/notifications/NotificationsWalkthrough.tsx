import React from 'react';
import {
    Box,
    Text,
    Anchor,
    List
} from '@mantine/core';
import { FcmServiceAccountField } from '../../../components/fields/FcmServiceAccountField';

export const NotificationsWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Notifications</Text>
                <Text fz='md' mt={20}>
                    BlueBubbles uses <strong>Firebase Cloud Messaging</strong> (HTTP&nbsp;v1) to push notifications
                    to your devices. Set it up by uploading your Firebase project&apos;s <strong>service account</strong>{' '}
                    JSON &mdash; it&apos;s the only credential the server needs, and your private key never leaves this Mac.
                </Text>

                <Text fz='3xl' mt={40}>Get your service account</Text>
                <List size='md' mt={12} spacing={6}>
                    <List.Item>
                        Create a free Firebase project at{' '}
                        <Anchor href='https://console.firebase.google.com' target='_blank'>console.firebase.google.com</Anchor>
                    </List.Item>
                    <List.Item>Open <strong>Project settings → Service accounts</strong></List.Item>
                    <List.Item>Click <strong>Generate new private key</strong> and download the JSON file</List.Item>
                    <List.Item>Drag it onto the box below (you can also do this later from Settings)</List.Item>
                </List>

                <Box mt={20}>
                    <FcmServiceAccountField />
                </Box>
            </Box>
        </Box>
    );
};
