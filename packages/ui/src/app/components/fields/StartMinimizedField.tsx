import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface StartMinimizedFieldProps {
    helpText?: string;
}

export const StartMinimizedField = ({ helpText }: StartMinimizedFieldProps): JSX.Element => {
    const startMinimized: boolean = (useAppSelector(state => state.config.start_minimized) ?? false);

    return (
        <Box>
            <Checkbox id='start_minimized' checked={startMinimized} onChange={onCheckboxToggle} label="Start Minimized" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, the Gator Server will be minimized after starting up.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
