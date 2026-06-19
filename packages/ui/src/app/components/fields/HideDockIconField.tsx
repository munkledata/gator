import React from 'react';
import {
    Box,
    Text,
    Checkbox
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';


export interface HideDockIconFieldProps {
    helpText?: string;
}

export const HideDockIconField = ({ helpText }: HideDockIconFieldProps): JSX.Element => {
    const hideDockIcon: boolean = (useAppSelector(state => state.config.hide_dock_icon) ?? false);

    return (
        <Box>
            <Checkbox id='hide_dock_icon' checked={hideDockIcon} onChange={onCheckboxToggle} label="Hide Dock Icon" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        Hiding the dock icon will not close the app. You can open the app again via the status bar icon.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
