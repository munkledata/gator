import React from 'react';
import { useMantineColorScheme } from '@mantine/core';

export const withColorModeHooks = (Elem: any): (props: any) => JSX.Element => {
    // eslint-disable-next-line react/display-name
    return (props: any): JSX.Element => {
        const { colorScheme, toggleColorScheme, setColorScheme } = useMantineColorScheme();
        const useColorMode = {
            colorMode: colorScheme === 'auto' ? 'light' : colorScheme,
            toggleColorMode: toggleColorScheme,
            setColorMode: setColorScheme
        };
        const useColorModeValue = <L, D>(light: L, dark: D): L | D => (colorScheme === 'dark' ? dark : light);
        return <Elem
            useColorModeValue={useColorModeValue}
            useColorMode={useColorMode}
            {...props}
        />;
    };
};