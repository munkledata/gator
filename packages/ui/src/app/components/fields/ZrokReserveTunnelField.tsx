import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface ZrokReserveTunnelFieldProps {
    helpText?: string;
}

export const ZrokReserveTunnelField = ({ helpText }: ZrokReserveTunnelFieldProps): JSX.Element => {
    const reserveTunnel: boolean = (useAppSelector(state => state.config.zrok_reserve_tunnel) ?? false);

    return (
        <Box>
            <Checkbox id='zrok_reserve_tunnel' checked={reserveTunnel} onChange={onCheckboxToggle} label="Reserve a Static Subdomain" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        Enabling this will create a reserved tunnel with Zrok.
                        This means your Zrok URL will be static and never change.
                    </Text>
                )}
            </Text>
        </Box>
    );
};
