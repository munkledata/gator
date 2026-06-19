import React, { useEffect, useState } from 'react';
import {
    Box,
    TextInput,
    ActionIcon,
    Text
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { showSuccessToast } from '../../utils/ToastUtils';
import { setConfig } from '../../slices/ConfigSlice';
import { AiFillEye, AiFillEyeInvisible, AiOutlineSave } from 'react-icons/ai';


export interface ZrokTokenFieldProps {
    helpText?: string;
}

export const ZrokTokenField = ({ helpText }: ZrokTokenFieldProps): JSX.Element => {
    const dispatch = useAppDispatch();
    const zrokToken: string = (useAppSelector(state => state.config.zrok_token) ?? '');
    const [showZrokToken, setShowZrokToken] = useDisclosure();
    const [newZrokToken, setNewZrokToken] = useState(zrokToken);
    const [zrokTokenError, setZrokTokenError] = useState('');
    const hasZrokTokenError: boolean = (zrokTokenError ?? '').length > 0;

    useEffect(() => { setNewZrokToken(zrokToken); }, [zrokToken]);

    /**
     * A handler & validator for saving a new Zrok auth token.
     *
     * @param theNewZrokToken - The new auth token to save
     */
    const saveZrokToken = (theNewZrokToken: string): void => {
        theNewZrokToken = theNewZrokToken.trim();

        // Validate the port
        if (theNewZrokToken.includes(' ')) {
            setZrokTokenError('Invalid Zrok Token! Please check that you have copied it correctly.');
            return;
        } else if (theNewZrokToken.length === 0) {
            setZrokTokenError('An Zrok Token is required to use the Zrok proxy service!');
            return;
        }

        dispatch(setConfig({ name: 'zrok_token', value: theNewZrokToken }));
        setZrokTokenError('');
        showSuccessToast({
            id: 'settings',
            duration: 4000,
            description: 'Successfully saved new Zrok Token! Restarting Proxy service...'
        });
    };

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='zrok_key'>Zrok Token (Required)</Text>
            <TextInput
                id='password'
                type={showZrokToken ? 'text' : 'password'}
                maw="20em"
                value={newZrokToken}
                onChange={(e: any) => {
                    if (hasZrokTokenError) setZrokTokenError('');
                    setNewZrokToken(e.target.value);
                }}
            />
            <ActionIcon
                ml={12}
                style={{ verticalAlign: 'top' }}
                variant="subtle"
                aria-label='View Zrok token'
                onClick={() => setShowZrokToken.toggle()}
            >
                {showZrokToken ? <AiFillEye /> : <AiFillEyeInvisible />}
            </ActionIcon>
            <ActionIcon
                ml={12}
                style={{ verticalAlign: 'top' }}
                variant="subtle"
                aria-label='Save Zrok token'
                onClick={() => saveZrokToken(newZrokToken)}
            >
                <AiOutlineSave />
            </ActionIcon>
            {!hasZrokTokenError ? (
                <Text fz="xs" c="dimmed">
                    {helpText ?? (
                        <Text>
                            A Zrok Token is required to use the Zrok proxy service. If you do not have one, you can sign up for a free account within BlueBubbles.
                        </Text>
                    )}
                </Text>
            ) : (
                <Text fz="xs" c="red">{zrokTokenError}</Text>
            )}
        </Box>
    );
};