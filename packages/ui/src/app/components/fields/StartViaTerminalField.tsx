import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';


export interface StartViaTerminalFieldProps {
    helpText?: string;
}

export const StartViaTerminalField = ({ helpText }: StartViaTerminalFieldProps): JSX.Element => {
    const startViaTerminal: boolean = (useAppSelector(state => state.config.start_via_terminal) ?? false);

    return (
        <Box>
            <Checkbox id='start_via_terminal' checked={startViaTerminal} onChange={onCheckboxToggle} label="Always Start via Terminal" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When Gator starts up, it will auto-reload itself in terminal mode.
                        When in terminal, type "help" for command information.
                    </Text>
                )}
            </Text>
        </Box>
    );
};