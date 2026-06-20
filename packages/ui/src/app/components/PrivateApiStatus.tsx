import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    Group,
    List
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { keyframes } from '@emotion/react';
import { BiRefresh } from 'react-icons/bi';
import { getPrivateApiStatus } from '../utils/IpcUtils';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;


export const PrivateApiStatus = (): JSX.Element => {
    const [showProgress, setShowProgress] = useDisclosure();
    const [status, setStatus] = useState((): NodeJS.Dict<any> | null => {
        return null;
    });

    const refreshStatus = () => {
        setShowProgress.open();
        getPrivateApiStatus().then(status => {
            // I like longer spinning
            setTimeout(() => {
                setShowProgress.close();
            }, 1000);
            
            if (!status) return;
            setStatus(status);
        });
    };

    useEffect(() => {
        refreshStatus();
    }, []);

    const connected = status?.connected === null ? '...' : (status?.connected ?? false) ? 'Yes' : 'No';
    return (
        <Box p={12} w='325px' style={{ border: '1px solid var(--mantine-color-dark-4)', borderRadius: 'var(--mantine-radius-lg)' }}>
            <Group align='center'>
                <Text fz='lg' fw='bold'>Private API Status</Text>
                <Box
                    style={{ animation: showProgress ? `${spin} infinite 1s linear` : undefined }}
                    onClick={refreshStatus}
                >
                    <BiRefresh />
                </Box>
            </Group>
            <List mt={8} ml={32}>
                <List.Item>
                    <Text fz='md'><strong>Connected</strong>:&nbsp;
                        <Box>{connected}</Box>
                    </Text>
                </List.Item>
                <List.Item>
                    <Text fz='md'><strong>Port</strong>:&nbsp;
                        <Box>{status?.port ?? '...'}</Box>
                    </Text>
                </List.Item>
            </List>
        </Box>
    );
};