import React from 'react';
import {
    Box,
    Text,
} from '@mantine/core';
import { AutoStartMethodField } from '../../../components/fields/AutoStartMethodField';
import { AutoCaffeinateField } from '../../../components/fields/AutoCaffeinateField';
import { OpenFindMyOnStartupField } from 'app/components/fields/OpenFindMyOnStartupField';


export const ConfigurationsWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Setup Complete!</Text>
                <Text fz='md' mt={20}>
                    Congratulations, you have completed the BlueBubbles Server setup! Here are some useful features that
                    you may want to checkout to customize your BlueBubbles experience!
                </Text>
                <Text fz='3xl' mt={20}>Features</Text>
                <Box my={12} />
                <OpenFindMyOnStartupField />
                <Box my={12} />
                <AutoStartMethodField />
                <Box my={12} />
                <AutoCaffeinateField />
            </Box>
        </Box>
    );
};
