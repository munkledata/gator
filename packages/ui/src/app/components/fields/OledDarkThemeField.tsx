import React from 'react';
import {
    Box,
    Text,
    Checkbox
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface UseOledDarkModeFieldProps {
    helpText?: string;
}

export const UseOledDarkModeField = ({ helpText }: UseOledDarkModeFieldProps): JSX.Element => {
    const oledDark: boolean = (useAppSelector(state => state.config.use_oled_dark_mode) ?? false);

    return (
        <Box>
            <Checkbox id='use_oled_dark_mode' checked={oledDark} onChange={onCheckboxToggle} label='Use OLED Black Dark Mode' />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        Enabling this will set the dark mode theme to OLED black
                    </Text>
                )}
            </Text>
        </Box>
    );
};
