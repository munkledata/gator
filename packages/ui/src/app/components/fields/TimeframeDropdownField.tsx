import React from 'react';
import {
    NativeSelect,
    Flex,
    Box,

} from '@mantine/core';


export interface TimeframeDropdownFieldProps {
    selectedDays: number;
    onChange?: (days: number) => void;
}

export const TimeframeDropdownField = ({ selectedDays = 30 * 6, onChange }: TimeframeDropdownFieldProps): JSX.Element => {
    return (
        <Box w="fit-content">
            <Flex direction='row' justify='flex-start' align='center'>
                <NativeSelect
                    maw="16em"
                    mr={12}
                    value={String(selectedDays)}
                    onChange={(e: any) => {
                        if (onChange) {
                            onChange(Number.parseInt(e.target.value));
                        }
                    }}
                >
                    <option value='0'>All Time</option>
                    <option value='365'>Past Year</option>
                    <option value='180'>Past 6 Months</option>
                    <option value='30'>Past Month</option>
                </NativeSelect>
            </Flex>
        </Box>
    );
};
