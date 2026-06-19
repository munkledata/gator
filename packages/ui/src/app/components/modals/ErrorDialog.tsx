import React from 'react';
import {
    Modal,
    Box,
    Group,
    Text,
    Button,
    List
} from '@mantine/core';
type FocusableElement = HTMLElement;

export type ErrorItem = {
    id: string,
    message: string
};

interface ErrorDialogProps {
    title?: string;
    errorsPrefix?: string;
    errors: Array<ErrorItem>;
    closeButtonText?: string;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
    onClose: () => void
}

export const ErrorDialog = ({
    title = 'Error!',
    errorsPrefix = 'The following errors have occurred:',
    errors,
    closeButtonText = 'Close',
    isOpen,
    modalRef,
    onClose
}: ErrorDialogProps): JSX.Element => {
    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose()}
            withCloseButton={false}
        >
            <Text fw="bold" fz="lg">
                {title}
            </Text>

            <Box>
                {errorsPrefix}
                <br />
                <br />
                <List>
                    {errors.map(e => {
                        return <List.Item key={e.id}>{e.message}</List.Item>;
                    })}
                </List>

            </Box>

            <Group justify="flex-end" mt="md">
                <Button
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => onClose()}
                >
                    {closeButtonText}
                </Button>
            </Group>
        </Modal>
    );
};
