import React from 'react';
import {
    Box,
    Text,
    Image
} from '@mantine/core';
import { PermissionRequirements } from '../../../components/PermissionRequirements';
import FullDiskImage from '../../../../images/walkthrough/full-disk-access.png';
import SystemPreferencesImage from '../../../../images/walkthrough/system-preferences.png';

export const PermissionsWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Permissions</Text>
                <Text fz='md' mt={20}>
                    Before setting up Gator, we need to make sure that the app is given the correct permissions
                    so that it can operate. The main permission that is required is the <strong>Full Disk Access</strong>&nbsp;
                    permission. This will allow Gator to read the iMessage database and provide notifications for
                    new messages. Accessibility permissions are optional and are not required for the base Gator functionality.
                </Text>
                <Text fz='md' mt={20}>
                    Here is an evaluation of your current permissions. If Full Disk Access is not enabled, you will not be
                    able to use Gator
                </Text>
                <Box my={12} />
                <PermissionRequirements />
                <Text fz='lg' my={20}><b>Quick Guide</b></Text>
                <Text fz='md' mt={20}>
                    Use the gear icon next to a permission failure above to open System Preferences,
                    then add/enable Gator:
                </Text>
                <Image src={SystemPreferencesImage} style={{ borderRadius: 'var(--mantine-radius-md)' }} my={8} />
                <Image src={FullDiskImage} style={{ borderRadius: 'var(--mantine-radius-md)' }} my={8} />

            </Box>
        </Box>
    );
};
