import React from 'react';
import {
    Divider,
    Stack,
    Text,
    Box
} from '@mantine/core';
import { UseOledDarkModeField } from '../../../components/fields/OledDarkThemeField';


export const ThemeSettings = (): JSX.Element => {
    return (
        <section>
            <Stack p={20}>
                <Text fz='2xl'>Theme Settings</Text>
                <Divider orientation='horizontal' />
                <Box style={{ flex: 1 }} />
                <UseOledDarkModeField />
            </Stack>
        </section>
    );
};
