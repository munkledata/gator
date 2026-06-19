import React from 'react';
import { Table } from '@mantine/core';
import { DeviceItem } from '../../slices/DevicesSlice';


export const DevicesTable = ({ devices }: { devices: Array<DeviceItem> }): JSX.Element => {
    return (
        <Table>
            <Table.Caption>Devices registered for notifications over Google Play Services</Table.Caption>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Last Active</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {devices.map(item => (
                    <Table.Tr key={item.name}>
                        <Table.Td style={{ wordBreak: 'break-all' }}>{item.name}</Table.Td>
                        <Table.Td style={{ wordBreak: 'break-all' }}>{`${item.id.substring(0, 100)}...`}</Table.Td>
                        <Table.Td>{new Date(item.lastActive).toLocaleString()}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
};
