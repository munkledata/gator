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

const getColor = (isLoaded: boolean, isDragging: boolean) => (isDragging) ? 'brand.primary' : (isLoaded ? 'green' : 'gray.400');

// Mantine resolves a bare hue to its primary shade; gray.400 maps to gray.4.
const mantineColor = (v: string): string => {
    if (!v.includes('.')) return v;
    const [hue, shade] = v.split('.');
    const n = Number(shade);
    if (!Number.isFinite(n)) return hue;
    const m = n <= 50 ? 0 : Math.min(9, Math.round(n / 100));
    return `${hue}.${m}`;
};

export const DropZone = ({ text, isDragging = false, isLoaded = false, loadedText = null }: DropZoneProps): JSX.Element => {
    const dragColor = getColor(isLoaded, isDragging);
    const dragFontSize = isDragging ? 'lg' : 'md';
    const dragIconSize = isDragging ? 36 : 28;
    return (
        <Box
            mih='100px'
            pl={20}
            pr={20}
            style={{ borderRadius: '3xl', borderWidth: '1px', border: 'dashed', borderColor: dragColor }}
        >
            <Center h='100%'>
                <Flex direction="row" justify="center" align="center">
                    <Box style={{ transition: 'all 2s ease' }}>
                        {/* The key is required for the color to change */}
                        <RiDragDropLine key={dragColor} size={dragIconSize} color={dragColor} />
                    </Box>

                    <Text
                        ml={12}
                        c={mantineColor(dragColor)}
                        ta='center'
                        fz={dragFontSize}
                        style={{ transition: 'all .2s ease' }}
                    >
                        {isLoaded && !isDragging ? loadedText : text}
                    </Text>
                </Flex>
            </Center>
        </Box>
    );
};
