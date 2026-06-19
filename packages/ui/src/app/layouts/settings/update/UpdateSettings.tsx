import React from 'react';
import {
    Divider,
    Stack,
    Text,
    Box
} from '@mantine/core';
import { CheckForUpdatesField } from '../../../components/fields/CheckForUpdatesField';


export const UpdateSettings = (): JSX.Element => {
    return (
        <section>
            <Stack p={20}>
                <Text fz='2xl'>Update Settings</Text>
                <Divider orientation='horizontal' />
                <Box style={{ flex: 1 }} />
                <CheckForUpdatesField />
            </Stack>
        </section>
    );
};
