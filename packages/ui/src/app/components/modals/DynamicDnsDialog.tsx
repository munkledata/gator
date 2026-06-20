import React, { useState } from 'react';
import {
    Modal,
    Box,
    Group,
    Button,
    List,
    TextInput,
    Text
} from '@mantine/core';
type FocusableElement = HTMLElement;


interface DynamicDnsDialogProps {
    onCancel?: () => void;
    onConfirm?: (address: string) => void;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
    onClose: () => void;
    port?: number
}

export const DynamicDnsDialog = ({
    onCancel,
    onConfirm,
    isOpen,
    modalRef,
    onClose,
    port = 1234
}: DynamicDnsDialogProps): JSX.Element => {
    const [address, setAddress] = useState('');
    const [error, setError] = useState('');
    const isInvalid = (error ?? '').length > 0;

    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose()}
            withCloseButton={false}
        >
            <Text fw={600} fz="lg">
                Set Dynamic DNS / Custom URL
            </Text>

            <Box>
                <Text>Enter your Dynamic DNS or Custom URL, including the scheme and port. The address must use <strong>https://</strong>. Here are some examples:</Text>
                <br />
                <List>
                    <List.Item>https://thequickbrownfox.ddns.net:{port}</List.Item>
                    <List.Item>https://gator.no-ip.org:{port}</List.Item>
                </List>
                <br />
                <Text>Only secure <strong>https://</strong> URLs are allowed, so make sure you have a valid TLS certificate for your domain.</Text>
                <br />
                <Box>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='address'>Dynamic DNS / Custom URL</Text>
                    <TextInput
                        id='address'
                        type='text'
                        maw="20em"
                        value={address}
                        placeholder={`https://<your DNS>:${port}`}
                        onChange={(e: any) => {
                            setError('');
                            setAddress(e.target.value);
                        }}
                    />
                    {isInvalid ? (
                        <Text fz="xs" c="red">{error}</Text>
                    ) : null}
                </Box>

            </Box>

            <Group justify="flex-end" mt="md">
                <Button
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (onCancel) onCancel();
                        onClose();
                    }}
                >
                    Cancel
                </Button>
                <Button
                    ml={12}
                    bg='brand'
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        const trimmed = address.trim();
                        if (trimmed.length === 0) {
                            setError('Please enter a Dynamic DNS address!');
                            return;
                        } else if (trimmed.startsWith('http://')) {
                            setError('Insecure http:// URLs are not allowed — please use https://');
                            return;
                        } else if (!trimmed.startsWith('https://')) {
                            setError('Please enter a valid URL starting with https://');
                            return;
                        }


                        if (onConfirm) onConfirm(trimmed);
                        onClose();
                    }}
                >
                    Save
                </Button>
            </Group>
        </Modal>
    );
};
