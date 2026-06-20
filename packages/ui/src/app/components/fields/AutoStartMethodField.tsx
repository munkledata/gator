import React from 'react';
import {
    NativeSelect,
    Flex,
    Box,
    Text,
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onSelectChange } from '../../actions/ConfigActions';


export interface AutoStartMethodFieldProps {
    helpText?: string;
}

export const AutoStartMethodField = ({ helpText }: AutoStartMethodFieldProps): JSX.Element => {
    const autoStartMethod: string = (useAppSelector(state => state.config.auto_start_method) ?? '');
    return (
        <Box>
            <Text component="label" htmlFor='auto_start_method' fw={500} fz="sm" mb={4}>Auto Start Method</Text>
            <Flex direction='row' justify='flex-start' align='center'>
                <NativeSelect
                    id='auto_start_method'
                    maw="15em"
                    mr={12}
                    value={autoStartMethod}
                    onChange={(e: any) => {
                        if (!e.target.value || e.target.value.length === 0) return;
                        onSelectChange(e);
                    }}
                >
                    <option value='unset'>Do Not Auto Start</option>
                    <option value='login-item'>Login Item</option>
                    <option value='launch-agent'>Launch Agent (Crash Persistent)</option>
                </NativeSelect>
            </Flex>
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    'Select whether you want the Gator Server to automatically start when you login to your computer. ' +
                    'The "Launch Agent" option will let Gator restart itself, even after a hard crash. If you try to ' +
                    'switch away from the "Launch Agent" method, the server may automatically close itself.'
                )}
            </Text>
        </Box>
    );
};
