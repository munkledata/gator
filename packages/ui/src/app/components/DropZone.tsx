import React from 'react';
import {
    Box,
    Flex,
    Text,
    Center
} from '@mantine/core';
import { RiDragDropLine } from 'react-icons/ri';

interface DropZoneProps {
    text: string;
    isDragging?: boolean;
    isLoaded?: boolean;
    loadedText?: string | null;
}

// Map the three states to real CSS colors (Mantine vars). The old Chakra-style tokens
// ('gray.400', 'brand.primary') were invalid as raw CSS, so the dashed border and icon
// rendered with no usable color.
const stateColor = (isLoaded: boolean, isDragging: boolean): string =>
    isDragging
        ? 'var(--mantine-primary-color-filled)'
        : isLoaded
            ? 'var(--mantine-color-green-6)'
            : 'var(--mantine-color-gray-5)';

export const DropZone = ({ text, isDragging = false, isLoaded = false, loadedText = null }: DropZoneProps): JSX.Element => {
    const color = stateColor(isLoaded, isDragging);
    const dragFontSize = isDragging ? 'lg' : 'md';
    const dragIconSize = isDragging ? 36 : 28;
    return (
        <Box
            mih='100px'
            px={20}
            style={{ borderRadius: 'var(--mantine-radius-lg)', border: `2px dashed ${color}`, transition: 'all .2s ease' }}
        >
            <Center h='100%'>
                <Flex direction="row" justify="center" align="center" py={16}>
                    <Box style={{ transition: 'all 2s ease' }}>
                        {/* The key is required for the color to change */}
                        <RiDragDropLine key={color} size={dragIconSize} color={color} />
                    </Box>

                    <Text
                        ml={12}
                        ta='center'
                        fz={dragFontSize}
                        style={{ color, transition: 'all .2s ease' }}
                    >
                        {isLoaded && !isDragging ? loadedText : text}
                    </Text>
                </Flex>
            </Center>
        </Box>
    );
};
