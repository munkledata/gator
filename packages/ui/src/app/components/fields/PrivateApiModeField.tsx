import React from 'react';
import {
    NativeSelect,
    Flex,
    Box,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onSelectChange } from '../../actions/ConfigActions';


export interface PrivateApiModeFieldProps {
    helpText?: string;
    showAddress?: boolean;
}

// const confirmationActions: ConfirmationItems = {};

export const PrivateApiModeField = ({ helpText }: PrivateApiModeFieldProps): JSX.Element => {
    const mode: string = (useAppSelector(state => state.config.private_api_mode) ?? '').toLowerCase().replace(' ', '-');
    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='private_api_mode'>Private API Injection Method</Text>
            <Flex direction='row' justify='flex-start' align='center'>
                <NativeSelect
                    id='private_api_mode'
                    maw="15em"
                    mr={12}
                    value={mode}
                    onChange={(e: any) => {
                        if (!e.target.value || e.target.value.length === 0) return;
                        onSelectChange(e);
                    }}
                >
                    <option value='macforge'>MacForge Bundle</option>
                    <option value='process-dylib'>Messages App DYLIB</option>
                </NativeSelect>
            </Flex>
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    'Select how you want the BlueBubbles Private API Helper Bundle to be injected into the Messages App. ' +
                    'Selecting "MacForge Bundle" will require MacForge to be installed. Selecting "Messages App DYLIB" will ' +
                    'attempt to inject the bundle into the Messages App directly.'
                )}
            </Text>
        </Box>
    );
};
