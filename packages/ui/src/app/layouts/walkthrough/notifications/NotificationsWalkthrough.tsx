import React from 'react';
import {
    Box,
    Text
} from '@mantine/core';
import { FcmServiceAccountField } from '../../../components/fields/FcmServiceAccountField';

export const NotificationsWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Notifications</Text>
                <Text fz='md' mt={20} mb={20}>
                    BlueBubbles uses <strong>Firebase Cloud Messaging</strong> (HTTP&nbsp;v1) to push notifications to
                    your devices. Set it up automatically by signing into Google, or upload an existing service account.
                    You can also do this later from Settings. Your private key never leaves this Mac.
                </Text>

                <FcmServiceAccountField />
            </Box>
        </Box>
    );
};
