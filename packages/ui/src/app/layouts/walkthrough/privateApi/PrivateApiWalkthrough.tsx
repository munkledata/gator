import React from 'react';
import {
    Box,
    Text,
    Title,
    Anchor,
    Alert
} from '@mantine/core';
import { PrivateApiField } from '../../../components/fields/PrivateApiField';


export const PrivateApiWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Private API Setup (Advanced | Optional)</Text>
                <Text fz='md' mt={20}>
                    You may already know this, but Gator is one of the only cross-platform iMessage solution that
                    supports sending reactions, replies, subjects, and effects. This is because we developed an Objective-C
                    library that allows us to interface with Apple's "Private APIs". Normally, this is not possible, however,
                    after disabling your macOS device's SIP controls, these private APIs are made accessible.
                </Text>
                <Text fz='md' mt={20}>
                    If you would like to find out more information, please go to the link below:
                </Text>
                <Box component='article' maw='sm' px={20} pb={20} pt={12} mt={20} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
                    <Text c='gray'>
                        https://docs.bluebubbles.app/private-api/
                    </Text>
                    <Title order={4} my={8}>
                        <Anchor href='https://bluebubbles.app/donate' target='_blank'>
                            Private API Documentation
                        </Anchor>
                    </Title>
                    <Text>
                        This documentation will go over the pros and cons to setting up the Private API. It will speak to
                        the risks of disabling SIP controls, as well as the full feature set that uses the Private API
                    </Text>
                </Box>
                <Text fz='3xl' mt={20}>Configurations</Text>
                <Alert color='blue' variant='light' mt={8}>
                    Unless you know what you're doing, please make sure the following Private API Requirements all pass
                    before enabling the setting.
                </Alert>
                <Box mt={16} />
                <PrivateApiField />
            </Box>
        </Box>
    );
};
