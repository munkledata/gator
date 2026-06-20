import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Gator green — the primary brand color, pulled from the gator in the app icon.
const gator: MantineColorsTuple = [
    '#e9faec',
    '#d3f2da',
    '#a7e4b5',
    '#78d68d',
    '#52ca6c',
    '#3ac358',
    '#2bbf4c', // index 6 — primary
    '#1da93d',
    '#0f9632',
    '#008226'
];

// The BlueBubbles / chat-bubble blue, kept as a secondary accent (e.g. links, stat badges).
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

// Deep navy — the badge background. Overrides Mantine's default dark scale so every
// surface (body, cards, borders) takes on the icon's navy tone instead of neutral gray.
// Index 7 is the body background, 6 is cards/hover, 4 is borders, 0-2 is text.
const navy: MantineColorsTuple = [
    '#c9d9ec',
    '#a6bfda',
    '#7f9dc0',
    '#5c7ba0',
    '#42597e',
    '#2f445f',
    '#213650',
    '#15273d',
    '#0e1f31',
    '#081625'
];

export const theme = createTheme({
    primaryColor: 'gator',
    primaryShade: { light: 6, dark: 6 },
    colors: { gator, brand, dark: navy }
});

export const baseTheme = { colors: { brand: { primary: '#4a96e6' } } };
