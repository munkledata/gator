import React from 'react';
import {
    Divider,
    Stack,
    Text,
    Box
} from '@mantine/core';
import { PollIntervalField } from '../../../components/fields/PollIntervalField';


export const DatabaseSettings = (): JSX.Element => {
    return (
        <section>
            <Stack p={20}>
                <Text fz='2xl'>Database Settings</Text>
                <Divider orientation='horizontal' />
                <Box style={{ flex: 1 }} />
                <PollIntervalField />
            </Stack>
        </section>
    );
};