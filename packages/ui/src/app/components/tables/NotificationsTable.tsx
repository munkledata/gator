import React from 'react';
import {
    Table,
    Flex,
    Text
} from '@mantine/core';
import { BiErrorAlt } from 'react-icons/bi';
import { AiOutlineWarning, AiOutlineInfoCircle } from 'react-icons/ai';
import { BsCheckAll } from 'react-icons/bs';
import { NotificationItem } from '../../slices/NotificationsSlice';
import { IconType } from 'react-icons';

const AlertTypeIcon: NodeJS.Dict<IconType> = {
    warn: AiOutlineWarning,
    info: AiOutlineInfoCircle,
    error: BiErrorAlt
};

export const NotificationsTable = ({ notifications }: { notifications: Array<NotificationItem> }): JSX.Element => {
    return (
        <Table>
            <Table.Caption>
                Alerts are normal to have. As long as the server recovers,
                you have nothing to worry about. Alerts are mostly helpful when you
                are experiencing an issue and want to see if any errors have occured.
            </Table.Caption>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Notification</Table.Th>
                    <Table.Th>Time / Read</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {notifications.map(item => {
                    const AlertIcon = AlertTypeIcon[item.type] ?? AiOutlineWarning;
                    return (
                        <Table.Tr key={item.id} c={(item?.read ?? false) ? 'gray.4' : 'current'}>
                            <Table.Td style={{ verticalAlign: 'baseline' }}>
                                <AlertIcon
                                    size={24}
                                />
                            </Table.Td>
                            <Table.Td style={{ verticalAlign: 'baseline' }}>{item.message}</Table.Td>
                            <Table.Td style={{ verticalAlign: 'baseline' }}>
                                <Flex direction="row" justify="flex-end" align="center">
                                    <Text mr={4}>{item.timestamp.toLocaleString()}</Text>
                                    {(item?.read ?? false) ? <BsCheckAll fontSize={24} /> : null}
                                </Flex>

                            </Table.Td>
                        </Table.Tr>
                    );
                })}
            </Table.Tbody>
        </Table>
    );
};
