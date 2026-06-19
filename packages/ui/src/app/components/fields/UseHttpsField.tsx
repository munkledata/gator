import React from 'react';
import {
    Box,
    Text,
    Checkbox,
    Code
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';


export interface UseHttpsFieldProps {
    helpText?: string;
}

export const UseHttpsField = ({ helpText }: UseHttpsFieldProps): JSX.Element => {
    const useHttps: boolean = (useAppSelector(state => state.config.use_custom_certificate) ?? false);

    return (
        <Box>
            <Checkbox id='use_custom_certificate' checked={useHttps} onChange={onCheckboxToggle} label="Use Custom Certificate" />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        This will install a self-signed certificate at: <Code>~/Library/Application Support/bluebubbles-server/Certs</Code>
                        <br />
                        Note: Only use this this option if you have your own certificate! Replace the certificates in the <Code>Certs</Code> directory
                    </Text>
                )}
            </Text>
        </Box>
    );
};
