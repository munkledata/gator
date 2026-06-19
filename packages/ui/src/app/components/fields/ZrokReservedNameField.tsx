import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    TextInput,
    ActionIcon
} from '@mantine/core';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { showSuccessToast } from '../../utils/ToastUtils';
import { setConfig } from '../../slices/ConfigSlice';
import { AiOutlineSave } from 'react-icons/ai';


export interface ZrokReservedNameFieldProps {
    helpText?: string;
}

export const ZrokReservedNameField = ({ helpText }: ZrokReservedNameFieldProps): JSX.Element => {
    const dispatch = useAppDispatch();
    const zrokToken: string = (useAppSelector(state => state.config.zrok_reserved_name) ?? '');
    const [newZrokReservedName, setNewZrokReservedName] = useState(zrokToken);
    const [zrokTokenError, setZrokReservedNameError] = useState('');
    const hasZrokReservedNameError: boolean = (zrokTokenError ?? '').length > 0;

    useEffect(() => { setNewZrokReservedName(zrokToken); }, [zrokToken]);

    /**
     * A handler & validator for saving a new Zrok auth token.
     *
     * @param theNewZrokReservedName - The new auth token to save
     */
    const saveZrokReservedName = (theNewZrokReservedName: string): void => {
        theNewZrokReservedName = theNewZrokReservedName.trim();

        // Validate the port
        if (theNewZrokReservedName === zrokToken) {
            setZrokReservedNameError('You have not changed the name since your last save!');
            return;
        } else if (/[^a-zA-Z0-9-_]/.test(theNewZrokReservedName)) {
            setZrokReservedNameError(
                'Invalid Zrok Tunnel Name! Only lowercase alpha-numeric characters are allowed.');
            return;
        }

        dispatch(setConfig({ name: 'zrok_reserved_name', value: theNewZrokReservedName }));
        setZrokReservedNameError('');
        showSuccessToast({
            id: 'settings',
            duration: 4000,
            description: 'Successfully saved new Zrok Reserved Name! Restarting Proxy service...'
        });
    };

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='zrok_reserved_name'>Reserved Subdomain (Optional)</Text>
            <TextInput
                id='password'
                type='text'
                maw="20em"
                value={newZrokReservedName}
                onChange={(e: any) => {
                    if (hasZrokReservedNameError) setZrokReservedNameError('');
                    setNewZrokReservedName(e.target.value);
                }}
            />
            <ActionIcon
                ml={12}
                variant="subtle"
                aria-label='Save Zrok token'
                onClick={() => saveZrokReservedName(newZrokReservedName)}
                style={{ verticalAlign: 'top' }}
            >
                <AiOutlineSave />
            </ActionIcon>
            {!hasZrokReservedNameError ? (
                <Text fz="xs" c="dimmed">
                    {helpText ?? (
                        <Text>
                            Enter a name to reserve for your Zrok tunnel.
                            This name will be used as the subdomain for your Zrok tunnel.
                            This name may only be lowercase alpha-numeric characters. If
                            left blank, a randomly generated name will be used.
                        </Text>
                    )}
                </Text>
            ) : (
                <Text fz="xs" c="red">{zrokTokenError}</Text>
            )}
        </Box>
    );
};
