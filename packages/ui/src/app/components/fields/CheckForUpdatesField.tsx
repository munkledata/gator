import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface CheckForUpdatesFieldProps {
    helpText?: string;
}

export const CheckForUpdatesField = ({ helpText }: CheckForUpdatesFieldProps): JSX.Element => {
    const checkForUpdates: boolean = (useAppSelector(state => state.config.check_for_updates) ?? false);

    return (
        <Box>
            <Checkbox id='check_for_updates' checked={checkForUpdates} onChange={onCheckboxToggle} label="Check for Updates on Startup" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, BlueBubbles will automatically check for updates on startup
                    </Text>
                )}
            </Text>
        </Box>
    );
};

