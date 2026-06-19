import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Group,
    Modal,
    TextInput,
    Text,
    MultiSelect
} from '@mantine/core';
type FocusableElement = HTMLElement;
import { webhookEventOptions } from '../../constants';
import { MultiSelectValue } from '../../types';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { create, update } from '../../slices/WebhooksSlice';
import { convertMultiSelectValues } from '../../utils/GenericUtils';


interface AddWebhookDialogProps {
    onCancel?: () => void;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
    onClose: () => void;
    existingId?: number;
}


export const AddWebhookDialog = ({
    onCancel,
    isOpen,
    modalRef,
    onClose,
    existingId,
}: AddWebhookDialogProps): JSX.Element => {
    const [url, setUrl] = useState('');
    const dispatch = useAppDispatch();
    const webhooks = useAppSelector(state => state.webhookStore.webhooks) ?? [];
    const [selectedEvents, setSelectedEvents] = useState(
        webhookEventOptions.filter((option: any) => option.label === 'All Events') as Array<MultiSelectValue>);
    const [urlError, setUrlError] = useState('');
    const isUrlInvalid = (urlError ?? '').length > 0;
    const [eventsError, setEventsError] = useState('');
    const isEventsError = (eventsError ?? '').length > 0;

    useEffect(() => {
        if (!existingId) return;

        const webhook = webhooks.find(e => e.id === existingId);
        if (webhook) {
            setUrl(webhook.url);
            setSelectedEvents(convertMultiSelectValues(JSON.parse(webhook.events)));
        }
    }, [existingId]);

    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose()}
            withCloseButton={false}
        >
            <Text fw={600} fz="lg">
                Add a new Webhook
            </Text>

            <Box>
                <Text>Enter a URL to receive a POST request callback when an event occurs</Text>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='url'>URL</Text>
                    <TextInput
                        id='url'
                        type='text'
                        value={url}
                        placeholder='https://<your URL path>'
                        onChange={(e: any) => {
                            setUrlError('');
                            setUrl(e.target.value);
                        }}
                    />
                    {isUrlInvalid ? (
                        <Text fz="xs" c="red">{urlError}</Text>
                    ) : null}
                </Box>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='permissions'>Event Subscriptions</Text>
                    <MultiSelect
                        size='md'
                        searchable
                        data={webhookEventOptions}
                        value={selectedEvents.map(e => e.value)}
                        onChange={(vals) => {
                            setEventsError('');
                            setSelectedEvents(
                                vals.map(v => webhookEventOptions.find((o: any) => o.value === v) ?? { value: v, label: v }) as Array<MultiSelectValue>
                            );
                        }}
                    />
                    {isEventsError ? (
                        <Text fz="xs" c="red">{eventsError}</Text>
                    ) : null}
                </Box>

            </Box>

            <Group justify="flex-end" mt="md">
                <Button
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (onCancel) onCancel();
                        setUrl('');
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
                        if (url.length === 0) {
                            setUrlError('Please enter a webhook URL!');
                            return;
                        }

                        if (selectedEvents.length === 0) {
                            setEventsError('Please select at least 1 event to subscribe to!');
                            return;
                        }

                        if (existingId) {
                            dispatch(update({ id: existingId, url, events: selectedEvents }));
                        } else {
                            dispatch(create({ url, events: selectedEvents }));
                        }

                        setUrl('');
                        onClose();
                    }}
                >
                    Save
                </Button>
            </Group>
        </Modal>
    );
};
