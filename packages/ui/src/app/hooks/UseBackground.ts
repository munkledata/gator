import { useMantineColorScheme } from '@mantine/core';

import { useAppSelector } from '../hooks';

export const useBackground = () => {
    const { colorScheme } = useMantineColorScheme();
    // Mantine's colorScheme can be 'auto'; treat it as light (the legacy shim did the same).
    const colorMode = colorScheme === 'auto' ? 'light' : colorScheme;
    const useOled = useAppSelector(state => state.config.use_oled_dark_mode ?? false);
    if (colorMode === 'light') return 'white';
    return (useOled) ? 'black' : 'gray.8';
};
