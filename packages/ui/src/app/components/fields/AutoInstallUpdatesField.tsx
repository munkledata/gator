import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface AutoInstallUpdatesFieldProps {
    helpText?: string;
}

export const AutoInstallUpdatesField = ({ helpText }: AutoInstallUpdatesFieldProps): JSX.Element => {
    const autoInstall: boolean = (useAppSelector(state => state.config.auto_install_updates) ?? false);

    return (
        <Box>
            <Checkbox id='auto_install_updates' checked={autoInstall} onChange={onCheckboxToggle} label="Auto Install / Apply Updates" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, BlueBubbles will auto-install the latest available version when an update is detected
                    </Text>
                )}
            </Text>
        </Box>
    );
};
