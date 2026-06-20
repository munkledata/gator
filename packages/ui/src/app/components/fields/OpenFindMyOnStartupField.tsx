import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface OpenFindMyOnStartupFieldProps {
    helpText?: string;
}

export const OpenFindMyOnStartupField = ({ helpText }: OpenFindMyOnStartupFieldProps): JSX.Element => {
    const openFindMyOnStartup: boolean = (useAppSelector(state => state.config.open_findmy_on_startup) ?? false);

    return (
        <Box>
            <Checkbox id='open_findmy_on_startup' checked={openFindMyOnStartup} onChange={onCheckboxToggle} label='Open FindMy App on Startup' />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, Gator will automatically open, then hide the FindMy app when the server starts.
                        This is to trigger the fetch of locations from the FindMy app so the server can cache them for clients.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
