import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    TextInput,
    ActionIcon,
    Flex
} from '@mantine/core';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { showSuccessToast } from '../../utils/ToastUtils';
import { setConfig } from '../../slices/ConfigSlice';
import { AiOutlineSave } from 'react-icons/ai';


export interface LocalPortFieldProps {
    helpText?: string;
}

export const LocalPortField = ({ helpText }: LocalPortFieldProps): JSX.Element => {
    const dispatch = useAppDispatch();

    const port: number = useAppSelector(state => state.config.socket_port) ?? 1234;
    const [newPort, setNewPort] = useState(port);
    const [portError, setPortError] = useState('');
    const hasPortError: boolean = (portError?? '').length > 0;

    useEffect(() => { setNewPort(port); }, [port]);

    /**
     * A handler & validator for saving a new port.
     *
     * @param theNewPort - The new port to save
     */
    const savePort = (theNewPort: number): void => {
        // Validate the port
        if (theNewPort < 1024 || theNewPort > 65635) {
            setPortError('Port must be between 1,024 and 65,635');
            return;
        } else if (theNewPort === port) {
            setPortError('You have not changed the port since your last save!');
            return;
        }

        dispatch(setConfig({ name: 'socket_port', value: theNewPort }));
        if (hasPortError) setPortError('');
        showSuccessToast({
            id: 'settings',
            duration: 4000,
            description: 'Successfully saved new port! Restarting Proxy & HTTP services...'
        });
    };

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='socket_port'>Local Port</Text>
            <Flex direction='row' justify='flex-start' align='center'>
                <TextInput
                    id='socket_port'
                    type='number'
                    maw="5em"
                    value={newPort}
                    onChange={(e: any) => {
                        if (hasPortError) setPortError('');
                        setNewPort(Number.parseInt(e.target.value));
                    }}
                />
                <ActionIcon
                    ml={12}
                    variant="subtle"
                    style={{ verticalAlign: 'top' }}
                    aria-label='Save port'
                    onClick={() => savePort(newPort)}
                >
                    <AiOutlineSave />
                </ActionIcon>
            </Flex>
            {!hasPortError ? (
                <Text fz="xs" c="dimmed">
                    {helpText ?? 'Enter the local port for the socket server to run on'}
                </Text>
            ) : (
                <Text fz="xs" c="red">{portError}</Text>
            )}
        </Box>
    );
};
