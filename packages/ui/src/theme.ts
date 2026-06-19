import { createTheme, type MantineColorsTuple } from '@mantine/core';

// The BlueBubbles brand blue (#4A96E6) as a Mantine 10-shade tuple (index 6 = brand).
const brand: MantineColorsTuple = [
    '#e8f3ff',
    '#d3e4fd',
    '#a6c8fa',
    '#76aaf6',
    '#4f91f3',
    '#3a83f1',
    '#4a96e6',
    '#2a6fd0',
    '#1f63bb',
    '#0a52a6'
];

export const theme = createTheme({
    primaryColor: 'brand',
    colors: { brand }
});

export const baseTheme = { colors: { brand: { primary: '#4a96e6' } } };
