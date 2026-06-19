import React from 'react';
import {
    Table,
    Text,
    Box,
    Tooltip
} from '@mantine/core';
import { AiOutlineCheck } from 'react-icons/ai';
import { MdErrorOutline } from 'react-icons/md';
import { IoIosTimer } from 'react-icons/io';
import { VscDebugStart } from 'react-icons/vsc';
import { IconType } from 'react-icons';
import { BsTrash } from 'react-icons/bs';
import { intervalTypeToLabel } from 'app/constants';


export interface ScheduledMessageItem {
    id: string | null,
    type: string,
    payload: {
        chatGuid: string,
        message: string,
        method: string,
        selectedMessageGuid?: string,
        effectId?: string,
        subject?: string,
        attributedBody?: NodeJS.Dict<any>,
        partIndex?: number
    },
    scheduledFor: number;
    schedule: {
        type: string,
        interval?: number,
        intervalType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'
    },
    error?: string,
    status?: string,
    created?: number,
    sentAt?: number
}

const statusMap: {[key: string]: { icon: IconType, label: string }} = {
    pending: {
        icon: IoIosTimer,
        label: 'Pending'
    },
    'in-progress': {
        icon: VscDebugStart,
        label: 'In Progress'
    },
    error: {
        icon: MdErrorOutline,
        label: 'Error'
    },
    complete: {
        icon: AiOutlineCheck,
        label: 'Complete'
    }
};


export const ScheduledMessagesTable = ({
    messages,
    onDelete
}: {
    messages: Array<ScheduledMessageItem>,
    onDelete?: (contactId: number | string) => void
}): JSX.Element => {
    return (
        <Box>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th style={{ alignContent: 'left' }}>Status</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Message</Table.Th>
                        <Table.Th>Scheduled For</Table.Th>
                        <Table.Th>Schedule Type</Table.Th>
                        <Table.Th>Delete</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {messages.map(item => {
                        const StatusIcon = statusMap[item.status as string].icon;
                        let label = statusMap[item.status as string]?.label;
                        if (item.error) {
                            label = item.error;
                        } else if (item.status === 'complete' && item.sentAt) {
                            const sentDate = new Date(item.sentAt);
                            label = `Sent at ${sentDate.toLocaleString()}`;
                        }

                        const date = new Date(item.scheduledFor);
                        let freq = '';
                        if (item.schedule.type === 'recurring') {
                            freq = `Every ${item.schedule.interval} ${intervalTypeToLabel[item.schedule.intervalType as string]}`;
                        }

                        const chatText = `Sending to ${item.payload.chatGuid}`;
                        return (
                            <Table.Tr key={item.id}>
                                <Table.Td style={{ alignContent: 'left' }}>
                                    <Tooltip label={label} withArrow aria-label={label.toLowerCase()}>
                                        <span>
                                            <StatusIcon />
                                        </span>
                                    </Tooltip>
                                </Table.Td>
                                <Table.Td>
                                    <Text>{item.type}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Tooltip label={chatText} withArrow aria-label={chatText.toLowerCase()}>
                                        <Text>{item.payload.message}</Text>
                                    </Tooltip>
                                </Table.Td>
                                <Table.Td><Text>{date.toLocaleString()}</Text></Table.Td>
                                <Table.Td style={{ alignContent: 'left' }}>
                                    <Tooltip label={freq} withArrow aria-label={freq.toLowerCase()}>
                                        <Text>{item.schedule.type === 'once' ? 'one-time' : item.schedule.type}</Text>
                                    </Tooltip>
                                </Table.Td>
                                <Table.Td onClick={async () => {
                                    if (onDelete && item.id) {
                                        onDelete(Number.parseInt(item.id));
                                    }
                                }}>
                                    <Tooltip label="Delete" withArrow aria-label='delete'>
                                        <span>
                                            <BsTrash />
                                        </span>
                                    </Tooltip>
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </Box>
    );
};
