import React from 'react';
import { Box, Text, Divider, Group } from '@mantine/core';
import { ConnectionSettings } from './connection/ConnectionSettings';
import { FeatureSettings } from './features/FeatureSettings';
import { PrivateApiSettings } from './privateApi/PrivateApiSettings';
import { UpdateSettings } from './update/UpdateSettings';
import { ResetSettings } from './reset/ResetSettings';
import { ThemeSettings } from './theme/ThemeSettings';
import { PermissionRequirements } from '../../components/PermissionRequirements';
import { AttachmentCacheBox } from 'app/components/AttachmentCacheBox';


export const SettingsLayout = (): JSX.Element => {
    return (
        <section>
            <Box p={12} style={{ borderRadius: 10 }}>
                <ConnectionSettings />
                <PrivateApiSettings />
                <FeatureSettings />
                <UpdateSettings />
                <ThemeSettings />
                <Group align='flex-start' p={20} style={{ flexWrap: 'wrap' }}>
                    <Box>
                        <Text fz='2xl'>Permission Status</Text>
                        <Divider orientation='horizontal' my={12}/>
                        <PermissionRequirements />
                    </Box>
                    <Box pl={20}>
                        <Text fz='2xl'>Attachment Management</Text>
                        <Divider orientation='horizontal' my={12}/>
                        <AttachmentCacheBox />
                    </Box>
                </Group>

                <ResetSettings />
            </Box>
        </section>
    );
};
