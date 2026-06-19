import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    TextInput,
    ActionIcon,
    Flex
} from '@mantine/core';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { showSuccessToast } from '../../utils/ToastUtils';
import { setConfig } from '../../slices/ConfigSlice';
import { AiOutlineSave } from 'react-icons/ai';


export interface PollIntervalFieldProps {
    helpText?: string;
}

export const PollIntervalField = ({ helpText }: PollIntervalFieldProps): JSX.Element => {
    const dispatch = useAppDispatch();

    const pollInterval: number = useAppSelector(state => state.config.db_poll_interval) ?? 1000;
    const [newInterval, setNewInterval] = useState(pollInterval);
    const [intervalError, setIntervalError] = useState('');
    const hasIntervalError: boolean = (intervalError?? '').length > 0;

    useEffect(() => { setNewInterval(pollInterval); }, [pollInterval]);

    /**
     * A handler & validator for saving a new poll interval
     *
     * @param theNewInterval - The new interval to save
     */
    const saveInterval = (theNewInterval: number): void => {
        // Validate the interval
        if (theNewInterval < 500) {
            setIntervalError('The interval must be at least 500ms or else database locks can occur');
            return;
        }

        dispatch(setConfig({ name: 'db_poll_interval', value: theNewInterval }));
        if (hasIntervalError) setIntervalError('');
        showSuccessToast({
            id: 'settings',
            duration: 4000,
            description: 'Successfully saved new poll interval! Restarting DB listeners...'
        });
    };

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='db_poll_interval'>Database Poll Interval (ms)</Text>
            <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                <TextInput
                    id='db_poll_interval'
                    type='number'
                    maw="5em"
                    value={newInterval}
                    onChange={(e: any) => {
                        if (hasIntervalError) setIntervalError('');
                        setNewInterval(Number.parseInt(e.target.value));
                    }}
                />
                <ActionIcon
                    variant="subtle"
                    ml={12}
                    style={{ verticalAlign: 'top' }}
                    aria-label='Save poll interval'
                    onClick={() => saveInterval(newInterval)}
                >
                    {<AiOutlineSave />}
                </ActionIcon>
            </Flex>
            {!hasIntervalError ? (
                <Text fz="xs" c="dimmed">
                    {helpText ?? 'Enter how often (in milliseconds) you want the server to check for new messages in the database'}
                </Text>
            ) : (
                <Text fz="xs" c="red">{intervalError}</Text>
            )}
        </Box>
    );
};
