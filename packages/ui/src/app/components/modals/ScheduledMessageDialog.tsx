import { invoke } from 'lib/apiClient';
import React, { useEffect, useState } from 'react';
import {
    Modal,
    Box,
    Group,
    Text,
    Button,
    TextInput,
    Radio
} from '@mantine/core';
type FocusableElement = HTMLElement;
import { ScheduledMessageItem } from '../tables/ScheduledMessagesTable';
import { Options, Select } from 'lib/select';
import { intervalTypeOpts, scheduledMessageTypeOptions, scheduleTypeOptions } from 'app/constants';
import { useAppSelector } from 'app/hooks';


interface ScheduledMessageDialogProps {
    onCancel?: () => void;
    onCreate?: (message: ScheduledMessageItem) => void;
    onClose: () => void;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
}

const toLocalIsoString = (date: Date | null) => {
    if (!date) return '';

    const pad = (num: number) => {
        return (num < 10 ? '0' : '') + num;
    };

    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds());
};

export const ScheduledMessageDialog = ({
    onCancel,
    onCreate,
    onClose,
    isOpen,
    modalRef,
}: ScheduledMessageDialogProps): JSX.Element => {
    const usePrivateApi = useAppSelector(state => state.config.enable_private_api as boolean) ?? false;
    const [type, setType] = useState(scheduledMessageTypeOptions[0] as any | null);
    const [message, setMessage] = useState('');
    const [chatType, setChatType] = useState('dm');
    const [chatGuid, setChatGuid] = useState('');
    const [scheduledFor, setScheduledFor] = useState(null as Date | null);
    const [groups, setGroups] = useState([] as any | null);
    const [selectedGroup, setSelectedGroup] = useState(null as any | null);
    const [scheduleType, setScheduleType] = useState(scheduleTypeOptions[0] as any | null);
    const [intervalType, setIntervalType] = useState(intervalTypeOpts[0] as any | null);
    const [interval, setIntervalValue] = useState(1);
    const [messageError, setMessageError] = useState('');
    const hasMessageError = (messageError ?? '').length > 0;
    const [guidError, setGuidError] = useState('');
    const hasGuidError = (guidError ?? '').length > 0;
    const [dateError, setDateError] = useState('');
    const hasDateError = (dateError ?? '').length > 0;
    const [intervalError, setIntervalError] = useState('');
    const hasIntervalError = (intervalError ?? '').length > 0;

    useEffect(() => {
        invoke('get-chats').then((chats: any[]) => {
            chats.sort((a, b) => a.displayName && !b.displayName ? -1 : 1);
            const groups = chats.filter((e: any) => e.style === 43).map((e: any) => {
                let label = e.displayName ?? '';
                if (label.length === 0) {
                    label = e.participants.map((e: any) => e.address).join(', ');
                }
                return { label, value: e.guid };
            });
            setGroups(groups);
        });
    }, []);

    const _onClose = () => {
        setType(scheduledMessageTypeOptions[0] as any | null);
        setMessage('');
        setChatType('dm');
        setGroups([]);
        setSelectedGroup(null);
        setChatGuid('');
        setScheduledFor(null);
        setScheduleType(scheduleTypeOptions[0] as any | null);
        setIntervalType(intervalTypeOpts[0] as any | null);
        setIntervalValue(1);
        setMessageError('');
        setGuidError('');
        setIntervalError('');

        if (onClose) onClose();
    };

    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose()}
            withCloseButton={false}
        >
            <Text fw='bold' fz='lg'>
                Schedule a Message
            </Text>

            <Box>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4}>Type</Text>
                    <Select
                        size='md'
                        options={scheduledMessageTypeOptions as unknown as Options<string>}
                        value={type}
                        onChange={setType}
                    />
                </Box>
                <Box mt={20}>
                    <Radio.Group onChange={setChatType} value={chatType}>
                        <Group>
                            <Radio value='dm' label='Direct Message' />
                            <Radio value='group' label='Group Chat' />
                        </Group>
                    </Radio.Group>
                </Box>
                {chatType === 'dm' ? (
                    <Box mt={20}>
                        <Text component="label" fw={500} fz="sm" mb={4} htmlFor='message'>Phone Number / Chat GUID</Text>
                        <TextInput
                            id='chatGuid'
                            type='text'
                            value={chatGuid ?? ''}
                            placeholder=''
                            onChange={(e: any) => {
                                setGuidError('');
                                setChatGuid(e.target.value);
                            }}
                        />
                        {hasGuidError ? (
                            <Text fz="xs" c="red">{guidError}</Text>
                        ) : null}
                    </Box>
                ) : null}
                {chatType === 'group' ? (
                    <Box mt={20}>
                        <Text component="label" fw={500} fz="sm" mb={4}>Select Group Chat</Text>
                        <Select
                            size='md'
                            options={groups as unknown as Options<string>}
                            value={selectedGroup}
                            onChange={(e: any) => {
                                setSelectedGroup(e);
                                setChatGuid((e as any).value);
                            }}
                        />
                    </Box>
                ) : null}
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='message'>Message</Text>
                    <TextInput
                        id='message'
                        type='text'
                        value={message}
                        placeholder='Good morning :)'
                        onChange={(e: any) => {
                            setMessageError('');
                            setMessage(e.target.value);
                        }}
                    />
                    {hasMessageError ? (
                        <Text fz="xs" c="red">{messageError}</Text>
                    ) : null}
                </Box>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4}>Schedule Type</Text>
                    <Select
                        size='md'
                        options={scheduleTypeOptions as unknown as Options<string>}
                        value={scheduleType}
                        onChange={setScheduleType}
                    />
                </Box>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='scheduledFor'>Scheduled For</Text>
                    <TextInput
                        id='scheduledFor'
                        type='datetime-local'
                        defaultValue={toLocalIsoString(scheduledFor)}
                        onChange={(e: any) => {
                            setDateError('');
                            if (e.target.value.length !== 0) {
                                let date;

                                try {
                                    date = new Date(e.target.value);
                                } catch (e) {
                                    setDateError('Invalid date');
                                    return;
                                }

                                setScheduledFor(date);
                            }
                        }}
                    />
                    {hasDateError ? (
                        <Text fz="xs" c="red">{dateError}</Text>
                    ) : null}
                </Box>
                {scheduleType.value === 'recurring' ? (
                    <>
                        <Box mt={20}>
                            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='scheduleInterval'>Every</Text>
                            <TextInput
                                id='scheduleInterval'
                                type='number'
                                value={interval ?? 1}
                                onChange={(e: any) => {
                                    setIntervalValue(Number.parseInt(e.target.value));
                                }}
                            />
                            {hasIntervalError ? (
                                <Text fz="xs" c="red">{intervalError}</Text>
                            ) : null}
                        </Box>
                        <Box mt={20}>
                            <Select
                                size='md'
                                options={intervalTypeOpts as unknown as Options<string>}
                                value={intervalType}
                                onChange={setIntervalType}
                            />
                        </Box>
                    </>
                ) : null}
            </Box>

            <Group justify="flex-end" mt="md">
                <Button
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (onCancel) onCancel();
                        _onClose();
                    }}
                >
                    Cancel
                </Button>
                <Button
                    ml={12}
                    bg='brand'
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (chatGuid.length === 0) {
                            setGuidError('Please enter a phone number or chat GUID!');
                            return;
                        }

                        let guid = chatGuid;
                        if (chatType === 'dm' && !guid.includes(';-;')) {
                            guid = `iMessage;-;${guid}`;
                        }

                        if (message.length === 0) {
                            setMessageError('Please enter a message to send!');
                            return;
                        }

                        const now = new Date();
                        if (!scheduledFor || scheduledFor < now) {
                            setDateError('Please enter a date in the future!');
                            return;
                        }

                        if (!interval) {
                            setIntervalError('Please enter a valid interval!');
                            return;
                        } else if (interval < 1) {
                            setIntervalError('Interval must be > 0!');
                            return;
                        }

                        if (onCreate) {
                            onCreate({
                                id: null,
                                type: type?.value ?? 'send-message',
                                payload: {
                                    chatGuid: guid,
                                    message,
                                    method: usePrivateApi ? 'private-api' : 'apple-script'
                                },
                                scheduledFor: scheduledFor.getTime(),
                                schedule: {
                                    type: scheduleType.value,
                                    interval: interval ?? 1,
                                    intervalType: intervalType.value
                                }
                            });
                        }

                        _onClose();
                    }}
                >
                    Create
                </Button>
            </Group>
        </Modal>
    );
};
