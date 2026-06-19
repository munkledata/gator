import React from 'react';
import {
    Box,
    Text,
    Checkbox
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface AutoStartFieldProps {
    helpText?: string;
}

export const AutoStartField = ({ helpText }: AutoStartFieldProps): JSX.Element => {
    const autoStart: boolean = (useAppSelector(state => state.config.auto_start) ?? false);

    return (
        <Box>
            <Checkbox id='auto_start' checked={autoStart} onChange={onCheckboxToggle} label="Startup with macOS" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, BlueBubbles will start automatically when you login.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
