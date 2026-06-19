import React from 'react';
import { Table } from '@mantine/core';
import { LogItem } from '../../slices/LogsSlice';


export const LogsTable = ({ logs, caption }: { logs: Array<LogItem>, caption?: string }): JSX.Element => {
    const getLogRow = (item: LogItem) => {
        let textColor = 'auto';
        let textWeight = 'normal';
        if (item.type === 'error') {
            textColor = '#F56565';
            textWeight = '600';
        } else if (item.type === 'warn') {
            textColor = '#ED8936';
            textWeight = '500';
        } else if (item.type === 'debug') {
            textColor = '#4A5568';
        }

        return (
            <Table.Tr key={item.id}>
                <Table.Td c={textColor} fw={textWeight} style={{ wordBreak: 'break-word' }}>{item.message}</Table.Td>
                <Table.Td>{item.timestamp.toLocaleString()}</Table.Td>
            </Table.Tr>
        );
    };

    return (
        <Table>
            <Table.Caption>{caption ?? 'Logs will stream in as they come in'}</Table.Caption>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Log</Table.Th>
                    <Table.Th>Timestamp</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {logs.map(item => getLogRow(item))}
            </Table.Tbody>
        </Table>
    );
};
