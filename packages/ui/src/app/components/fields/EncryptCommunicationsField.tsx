import React from 'react';
import {
    Box,
    Text,
    Checkbox
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';


export interface EncryptCommunicationsFieldProps {
    helpText?: string;
}

export const EncryptCommunicationsField = ({ helpText }: EncryptCommunicationsFieldProps): JSX.Element => {
    const encryption: boolean = (useAppSelector(state => state.config.encrypt_coms) ?? false);

    return (
        <Box>
            <Checkbox id='encrypt_coms' checked={encryption} onChange={onCheckboxToggle} label="Encrypt Messages" />
            <Text fz="xs" c="dimmed">
                {helpText ?? 'Enabling this will add an additional layer of security to the app communications by encrypting messages with a password-based AES-256-bit algorithm'}
            </Text>
        </Box>
    );
};
