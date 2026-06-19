import React from 'react';
import { Modal, Box, Group, Text, Button } from '@mantine/core';
type FocusableElement = HTMLElement;


interface ConfirmationDialogProps {
    title?: string;
    body?: string;
    declineText?: string | null;
    onDecline?: () => void;
    acceptText?: string;
    onAccept?: () => void;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
    onClose: () => void;
}

const mapText = (text: string): JSX.Element[] => {
    const textSplit = text.split('<br />');
    return textSplit.map((e: string) => {
        return (
            <span key={e}>
                {e}
                <br />
            </span>
        );
    });
};

export const ConfirmationDialog = ({
    title = 'Are you sure?',
    body = 'Are you sure you want to perform this action?',
    declineText = 'No',
    acceptText = 'Yes',
    onDecline,
    onAccept,
    isOpen,
    modalRef,
    onClose
}: ConfirmationDialogProps): JSX.Element => {
    const bodyTxt = mapText(body);
    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose()}
            withCloseButton={false}
        >
            <Text fw='bold' fz='lg'>
                {title}
            </Text>

            <Box>
                {bodyTxt}
            </Box>

            <Group justify="flex-end" mt="md">
                {declineText ? (
                    <Button
                        ref={modalRef as React.Ref<HTMLButtonElement>}
                        onClick={() => {
                            if (onDecline) onDecline();
                            onClose();
                        }}
                    >
                        {declineText}
                    </Button>
                ): null}
                <Button
                    ml={12}
                    color='red'
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (onAccept) onAccept();
                        onClose();
                    }}
                >
                    {acceptText}
                </Button>
            </Group>
        </Modal>
    );
};
