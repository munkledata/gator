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
                <Text>Enter your Dynamic DNS or Custom URL, including the schema and port. Here are some examples:</Text>
                <br />
                <List>
                    <List.Item>http://thequickbrownfox.ddns.net:{port}</List.Item>
                    <List.Item>http://bluebubbles.no-ip.org:{port}</List.Item>
                </List>
                <br />
                <Text>If you plan to use your own custom certificate, please remember to use <strong>"https://"</strong> as your URL scheme</Text>
                <br />
                <Box>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='address'>Dynamic DNS / Custom URL</Text>
                    <TextInput
                        id='address'
                        type='text'
                        maw="20em"
                        value={address}
                        placeholder={`http://<your DNS>:${port}`}
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
                        if (address.length === 0) {
                            setError('Please enter a Dynamic DNS address!');
                            return;
                        } else if (!address.startsWith('http://') && !address.startsWith('https://')) {
                            setError('Please enter a valid Dynamic DNS URL (including http:// or https://)!');
                            return;
                        }


                        if (onConfirm) onConfirm(address);
                        onClose();
                    }}
                >
                    Save
                </Button>
            </Group>
        </Modal>
    );
};
