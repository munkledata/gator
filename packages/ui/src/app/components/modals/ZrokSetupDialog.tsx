import React, { useState } from 'react';
import {
    Modal,
    Box,
    Group,
    Button,
    TextInput,
    Text,
    ActionIcon
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAppSelector } from '../../hooks';
type FocusableElement = HTMLElement;
import { registerZrokEmail, setZrokToken } from 'app/utils/IpcUtils';
import { showSuccessToast } from 'app/utils/ToastUtils';
import { AiFillEye, AiFillEyeInvisible } from 'react-icons/ai';


interface ZrokSetupDialogProps {
    onCancel?: () => void;
    onConfirm?: (token: string) => void;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
    onClose: () => void;
}

export const ZrokSetupDialog = ({
    onCancel,
    onConfirm,
    isOpen,
    modalRef,
    onClose,
}: ZrokSetupDialogProps): JSX.Element => {
    const zrokToken: string = (useAppSelector(state => state.config.zrok_token) ?? '');
    const [email, setEmail] = useState('');
    const [token, setToken] = useState(zrokToken);
    const [emailError, setEmailError] = useState('');
    const [tokenError, setTokenError] = useState('');
    const [showToken, setShowToken] = useDisclosure();
    const [registerDisabled, setRegisterDisabled] = useState(false);
    const isEmailInvalid = (emailError ?? '').length > 0;
    const isTokenInvalid = (tokenError ?? '').length > 0;

    const closeProxy = () => {
        setRegisterDisabled(false);
        onClose();
    };

    return (
        <Modal
            opened={isOpen}
            withCloseButton={false}
            onClose={() => closeProxy()}
        >
            <Text fw="bold" fz="lg">
                Register Your Zrok Account
            </Text>

            <Box>
                <Text>In order to use Zrok, you must create a <i>free</i> account, which will generate a token for you.</Text>
                <br />
                <Text>
                    If you have not done so yet, enter your email address below to create an account. <b>You will receive an Email
                    giving you a link to register your account.</b> Use it to create an account and get your token.
                </Text>
                <br />
                <Box>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='address'>Email Address</Text>

                    <TextInput
                        id='zrok_email'
                        type='email'
                        placeholder="tim.apple@gmail.com"
                        maw="16em"
                        mr={12}
                        value={email}
                        onChange={(e: any) => {
                            setEmailError('');
                            setEmail(e.target.value);
                        }}
                    />
                    <Button
                        mt={'-2px'}
                        disabled={registerDisabled}
                        onClick={async () => {
                            setEmailError('');
                            if (email.trim().length === 0) {
                                return setEmailError('Please enter an email address!');
                            }

                            // Validate that it's a valid email
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            if (!emailRegex.test(email)) {
                                return setEmailError('Please enter a valid email address!');
                            }

                            try {
                                await registerZrokEmail(email);
                                showSuccessToast({
                                    title: 'Success',
                                    description: 'Successully registered your email! Check your inbox for the registration link.'
                                });
                                setRegisterDisabled(true);
                            } catch (ex: any) {
                                const err = ex?.message ?? String(ex);
                                setEmailError(err.substring(err.indexOf(':') + 1).trim());
                            }
                        }}
                    >Register</Button>
                    {isEmailInvalid ? (
                        <Text fz="xs" c="red">{emailError}</Text>
                    ) : null}
                </Box>
                <br />
                <Text>Save your token somewhere safe, then paste it into the field below.</Text>
                <br />
                <Box>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='address'>Token</Text>

                    <TextInput
                        id='zrok_token'
                        maw="16em"
                        type={showToken ? 'text' : 'password'}
                        mr={12}
                        value={token}
                        onChange={(e: any) => {
                            setTokenError('');
                            setToken(e.target.value);
                        }}
                    />
                    <ActionIcon
                        variant="subtle"
                        style={{ verticalAlign: 'top' }}
                        aria-label='View token'
                        onClick={() => setShowToken.toggle()}
                    >
                        {showToken ? <AiFillEye /> : <AiFillEyeInvisible />}
                    </ActionIcon>
                    {isTokenInvalid ? (
                        <Text fz="xs" c="red">{tokenError}</Text>
                    ) : null}
                </Box>
                <br />
            </Box>

            <Group justify="flex-end" mt="md">
                <Button
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (onCancel) onCancel();
                        closeProxy();
                    }}
                >
                    Cancel
                </Button>
                <Button
                    ml={12}
                    bg='brand'
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={async () => {
                        setTokenError('');
                        if (token.length === 0) {
                            setTokenError('Please enter an Auth Token!');
                            return;
                        }

                        try {
                            await setZrokToken(token);
                            if (onConfirm) onConfirm(token);
                            closeProxy();
                        } catch (ex: any) {
                            const err = ex?.message ?? String(ex);
                            setTokenError(err.substring(err.indexOf(':') + 1).trim());
                        }
                    }}
                >
                    Save
                </Button>
            </Group>
        </Modal>
    );
};
