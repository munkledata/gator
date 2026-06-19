import React, { useState, useEffect } from 'react';
import {
    Checkbox,
    Text,
    Box,
    Stack,
    Group,
    Button,
    Anchor
} from '@mantine/core';
import { useAppSelector } from '../../hooks';
import { onCheckboxToggle } from '../../actions/ConfigActions';
import { PrivateApiRequirements } from '../PrivateApiRequirements';
import { getEnv } from '../../utils/IpcUtils';
import { PrivateApiStatus } from '../PrivateApiStatus';
import { FaceTimeCallingField } from './FaceTimeCallingField';

export interface PrivateApiFieldProps {
    helpTextMessages?: string;
    helpTextFaceTime?: string;
}

export const PrivateApiField = ({ helpTextMessages, helpTextFaceTime }: PrivateApiFieldProps): JSX.Element => {
    const privateApi: boolean = (useAppSelector(state => state.config.enable_private_api) ?? false);
    const ftPrivateApi: boolean = (useAppSelector(state => state.config.enable_ft_private_api) ?? false);
    const [env, setEnv] = useState({} as Record<string, any>);

    useEffect(() => {
        getEnv().then((env) => {
            setEnv(env);
        });
    }, []);

    return (
        <Box mt={4}>
            <Group>
                <PrivateApiRequirements />
                <PrivateApiStatus />
            </Group>
            <Box mt={20}>
                <Stack>
                    <Button size='xs' w="150px" mb={8}>
                        <Anchor target="_blank" href="https://docs.bluebubbles.app/private-api/">
                            Private API Setup Docs
                        </Anchor>
                    </Button>
                    <Checkbox
                        id='enable_private_api'
                        checked={privateApi}
                        onChange={onCheckboxToggle}
                        label='Messages Private API'
                    />
                    <Text fz="xs" c="dimmed">
                        {helpTextMessages ?? (
                            <Text>
                                If you have set up the Private API features,
                                enable this option to allow the server to communicate with the iMessage Private APIs.
                                This will run an instance of the Messages app with our helper dylib injected into it.
                                Enabling this will allow you to send reactions, replies, editing, effects, use FindMy, etc.
                            </Text>
                        )}
                    </Text>
                    <Checkbox
                        id='enable_ft_private_api'
                        checked={ftPrivateApi}
                        onChange={onCheckboxToggle}
                        label='FaceTime Private API'
                    />
                    <Text fz="xs" c="dimmed">
                        {helpTextFaceTime ?? (
                            <Text>
                                If you have set up the Private API features,
                                enable this option to allow the server to communicate with the FaceTime Private APIs.
                                This will run an instance of the FaceTime app with our helper dylib injected into it.
                                Enabling this will allow the server to detect incoming FaceTime calls.
                            </Text>
                        )}
                    </Text>
                    {(ftPrivateApi && !!env?.isMinMonterey) ? (
                        <FaceTimeCallingField />
                    ) : null}
                </Stack>
            </Box>
        </Box>
    );
};