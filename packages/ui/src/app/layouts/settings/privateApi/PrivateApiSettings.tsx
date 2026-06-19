import React from 'react';
import {
    Divider,
    Stack,
    Text,
    Box
} from '@mantine/core';
import { PrivateApiField } from '../../../components/fields/PrivateApiField';


export const PrivateApiSettings = (): JSX.Element => {
    return (
        <section>
            <Stack p={20}>
                <Text fz='2xl'>Private API</Text>
                <Divider orientation='horizontal' />
                <Box style={{ flex: 1 }} />
                <PrivateApiField />
            </Stack>
        </section>
    );
};
