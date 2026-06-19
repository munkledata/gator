import React from 'react';
import {
    Box,
    Checkbox,
    Text
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';

export interface ExperimentalFaceTimeFeaturesFieldProps {
    helpText?: string;
}

export const FaceTimeCallingField = ({ helpText }: ExperimentalFaceTimeFeaturesFieldProps): JSX.Element => {
    const experimentalFeatures: boolean = (useAppSelector(state => state.config.facetime_calling) ?? false);

    return (
        <Box>
            <Checkbox id='facetime_calling' checked={experimentalFeatures} label="FaceTime Calling (Experimental)" onChange={onCheckboxToggle} />
            <Text fz="xs" c="dimmed">
                {helpText ?? (
                    <Text>
                        When enabled, the server will detect incoming FaceTime calls and forward
                        a notification to your device. If you choose to answer the the call
                        from the notification, the server will attempt to generate a link
                        for you to join with.
                    </Text>
                )}
            </Text>
        </Box>
    );
};

