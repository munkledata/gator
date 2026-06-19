import React from 'react';
import {
    Box,
    Text,
    Checkbox
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface AutoCaffeinateFieldProps {
    helpText?: string;
}

export const AutoCaffeinateField = ({ helpText }: AutoCaffeinateFieldProps): JSX.Element => {
    const keepAwake: boolean = (useAppSelector(state => state.config.auto_caffeinate) ?? false);

    return (
        <Box>
            <Checkbox id='auto_caffeinate' checked={keepAwake} onChange={onCheckboxToggle} label="Keep macOS Awake" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, you mac will not fall asleep due to inactivity or a screen screen saver.
                        However, your computer lid's close action may override this.
                        Make sure your computer does not go to sleep when the lid is closed.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
