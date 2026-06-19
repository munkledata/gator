import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    TextInput,
    ActionIcon
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { showSuccessToast } from '../../utils/ToastUtils';
import { setConfig } from '../../slices/ConfigSlice';
import { AiFillEye, AiFillEyeInvisible, AiOutlineSave } from 'react-icons/ai';


export interface ServerPasswordFieldProps {
    helpText?: string;
    errorOnEmpty?: boolean
}

export const ServerPasswordField = ({ helpText, errorOnEmpty = false }: ServerPasswordFieldProps): JSX.Element => {
    const dispatch = useAppDispatch();

    const password: string = (useAppSelector(state => state.config.password) ?? '');
    const [showPassword, setShowPassword] = useDisclosure(false);
    const [newPassword, setNewPassword] = useState(password);
    const [passwordError, setPasswordError] = useState('');
    const hasPasswordError: boolean = (passwordError?? '').length > 0;

    useEffect(() => {
        setNewPassword(password);
    }, [password]);

    useEffect(() => {
        if (errorOnEmpty && password.length === 0) {
            setPasswordError('Enter a password, then click the save button');
        }
    }, []);

    /**
     * A handler & validator for saving a new password.
     *
     * @param theNewPassword - The new password to save
     */
    const savePassword = (theNewPassword: string): void => {
        // Validate the port
        if (theNewPassword.length < 8) {
            setPasswordError('Your password must be at least 8 characters!');
            return;
        } else if (theNewPassword === password) {
            setPasswordError('You have not changed the password since your last save!');
            return;
        }

        dispatch(setConfig({ name: 'password', value: theNewPassword }));
        if (hasPasswordError) setPasswordError('');
        showSuccessToast({
            id: 'settings',
            description: 'Successfully saved new password!'
        });
    };

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='password'>Server Password</Text>
            <TextInput
                id='password'
                type={showPassword ? 'text' : 'password'}
                maw="20em"
                value={newPassword}
                onChange={(e: any) => {
                    if (hasPasswordError) setPasswordError('');
                    setNewPassword(e.target.value);
                }}
            />
            <ActionIcon
                ml={12}
                variant="subtle"
                style={{ verticalAlign: 'top' }}
                aria-label='View password'
                onClick={() => setShowPassword.toggle()}
            >
                {showPassword ? <AiFillEye /> : <AiFillEyeInvisible />}
            </ActionIcon>
            <ActionIcon
                ml={12}
                variant="subtle"
                style={{ verticalAlign: 'top' }}
                aria-label='Save password'
                onClick={() => savePassword(newPassword)}
            >
                <AiOutlineSave />
            </ActionIcon>
            {!hasPasswordError ? (
                <Text fz="xs" c="dimmed">
                    {helpText ?? 'Enter a password to use for clients to authenticate with the server'}
                </Text>
            ) : (
                <Text fz="xs" c="red">{passwordError}</Text>
            )}
        </Box>
    );
};
