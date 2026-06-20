import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface AutoLockMacFieldProps {
    helpText?: string;
}

export const AutoLockMacField = ({ helpText }: AutoLockMacFieldProps): JSX.Element => {
    const autoLock: boolean = (useAppSelector(state => state.config.auto_lock_mac) ?? false);

    return (
        <Box>
            <Checkbox id='auto_lock_mac' checked={autoLock} onChange={onCheckboxToggle} label='Automatically Lock Mac After Login' />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, you mac will be automatically locked when the Gator Server detects that it has just booted up.
                        The criteria for this is that the uptime for your Mac is less than 5 minutes.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
