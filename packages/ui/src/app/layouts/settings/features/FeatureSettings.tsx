import React from 'react';
import {
    Divider,
    Stack,
    Text,
    Accordion,
    Box
} from '@mantine/core';
import { AutoStartMethodField } from '../../../components/fields/AutoStartMethodField';
import { AutoCaffeinateField } from '../../../components/fields/AutoCaffeinateField';
import { DockBadgeField } from '../../../components/fields/DockBadgeField';
import { HideDockIconField } from '../../../components/fields/HideDockIconField';
import { StartViaTerminalField } from '../../../components/fields/StartViaTerminalField';
import { StartMinimizedField } from '../../../components/fields/StartMinimizedField';
import { StartDelayField } from 'app/components/fields/StartDelayField';
import { LandingPageField } from 'app/components/fields/LandingPageField';
import { OpenFindMyOnStartupField } from 'app/components/fields/OpenFindMyOnStartupField';
import { AutoLockMacField } from 'app/components/fields/AutoLockMacField';


export const FeatureSettings = (): JSX.Element => {
    return (
        <section>
            <Stack p={20}>
                <Text fz='2xl'>Features</Text>
                <Divider orientation='horizontal' />
                <Box style={{ flex: 1 }} />
                <OpenFindMyOnStartupField />
                <Box style={{ flex: 1 }} />
                <AutoCaffeinateField />
                <Box style={{ flex: 1 }} />
                <AutoStartMethodField />
                <Box style={{ flex: 1 }} />
                <StartMinimizedField />
                <Box style={{ flex: 1 }} />
                <AutoLockMacField />
                <Box style={{ flex: 1 }} />
                <DockBadgeField />
                <Box style={{ flex: 1 }} />
                <HideDockIconField />
                <Box style={{ flex: 1 }} />
                <StartDelayField />
                <Box style={{ flex: 1 }} />
                <Accordion multiple>
                    <Accordion.Item value="advanced-feature-settings">
                        <Accordion.Control>
                            <Box style={{ flex: '1' }} ta='left' w="15em">
                                Advanced Feature Settings
                            </Box>
                        </Accordion.Control>
                        <Accordion.Panel pb={16}>
                            <Stack>
                                <StartViaTerminalField />
                                <Box style={{ flex: 1 }} />
                                <LandingPageField />
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </section>
    );
};
