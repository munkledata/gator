import React from 'react';
import {
    Box,
    Text,
    Checkbox
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';


export interface DockBadgeFieldProps {
    helpText?: string;
}

export const DockBadgeField = ({ helpText }: DockBadgeFieldProps): JSX.Element => {
    const dockBadge: boolean = (useAppSelector(state => state.config.dock_badge) ?? false);

    return (
        <Box>
            <Checkbox id='dock_badge' checked={dockBadge} onChange={onCheckboxToggle} label="Show Dock Badge (Notifications)" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        Disable this to hide the notifications badge in the dock.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
