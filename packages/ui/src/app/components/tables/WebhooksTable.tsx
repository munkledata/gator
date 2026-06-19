import React, { useRef, useState } from 'react';
import {
    Table,
    Box,
    Grid,
    Tooltip,
    Group,
} from '@mantine/core';
import { FiTrash } from 'react-icons/fi';
import { AiOutlineEdit } from 'react-icons/ai';
import { remove, WebhookItem } from '../../slices/WebhooksSlice';
import { useAppDispatch } from '../../hooks';
import { webhookEventValueToLabel } from '../../utils/GenericUtils';
import { AddWebhookDialog } from '../modals/AddWebhookDialog';


export const WebhooksTable = ({ webhooks }: { webhooks: Array<WebhookItem> }): JSX.Element => {
    const dispatch = useAppDispatch();
    const dialogRef = useRef(null);
    const [selectedId, setSelectedId] = useState(undefined as number | undefined);
    return (
        <Box>
            <Table>
                <Table.Caption>These are callbacks to receive events from the BlueBubbles Server</Table.Caption>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>URL</Table.Th>
                        <Table.Th>Event Subscriptions</Table.Th>
                        <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {webhooks.map(item => (
                        <Table.Tr key={item.id}>
                            <Table.Td>{item.url}</Table.Td>
                            <Table.Td>{JSON.parse(item.events).map((e: string) => webhookEventValueToLabel(e)).join(', ')}</Table.Td>
                            <Table.Td>
                                <Group style={{ justifyContent: 'end' }}>
                                    <Tooltip label='Edit' position='bottom' withArrow>
                                        <Grid.Col onClick={() => setSelectedId(item.id)}>
                                            <AiOutlineEdit />
                                        </Grid.Col>
                                    </Tooltip>

                                    <Tooltip label='Delete' position='bottom' withArrow>
                                        <Grid.Col onClick={() => dispatch(remove(item.id))}>
                                            <FiTrash />
                                        </Grid.Col>
                                    </Tooltip>
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>

            <AddWebhookDialog
                existingId={selectedId}
                modalRef={dialogRef}
                isOpen={!!selectedId}
                onClose={() => {
                    setSelectedId(undefined);
                }}
            />
        </Box>
    );
};
