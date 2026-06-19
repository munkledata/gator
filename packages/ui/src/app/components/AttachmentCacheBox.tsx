import React, { useEffect, useState } from 'react';
import {
    Box,
    Text,
    Group,
    List,
    useMantineColorScheme
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { keyframes } from '@emotion/react';
import { BiRefresh, BiTrash } from 'react-icons/bi';
import { clearAttachmentCache, getAttachmentCacheInfo } from '../utils/IpcUtils';
import { showErrorToast, showSuccessToast } from 'app/utils/ToastUtils';


const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;


export const AttachmentCacheBox = (): JSX.Element => {
    const { colorScheme } = useMantineColorScheme();
    const [showProgress, setShowProgress] = useDisclosure();
    const [meta, setMeta] = useState((): Record<string, any> | null => {
        return null;
    });

    const refreshInfo = () => {
        setShowProgress.open();
        getAttachmentCacheInfo().then(info => {
            // I like longer spinning
            setTimeout(() => {
                setShowProgress.close();
            }, 1000);

            if (!info) return;
            setMeta(info);
        });
    };

    const clearCache = () => {
        clearAttachmentCache().then(() => {
            showSuccessToast({ description: 'Successfully cleared attachment caches!' });
        }).catch(() => {
            showErrorToast({ description: 'Failed to clear attachment caches!' });
        });

        refreshInfo();
    };

    useEffect(() => {
        refreshInfo();
    }, []);

    return (
        <Box style={{ border: '1px solid', borderColor: colorScheme === 'dark' ? 'gray.7' : 'gray.2', borderRadius: 'xl' }} p={12} w='300px'>
            <Group align='center'>
                <Text fz='lg' fw='bold'>Attachment Cache Info</Text>
                <Box
                    style={{ animation: showProgress ? `${spin} infinite 1s linear` : undefined }}
                    onClick={refreshInfo}
                >
                    <BiRefresh />
                </Box>
                <Box
                    onClick={clearCache}
                >
                    <BiTrash />
                </Box>
            </Group>
            <List mt={8} ml={32}>
                <List.Item>
                    <Group align='center'>
                        <Text fz='md'><strong>Attachment Count</strong>:&nbsp;
                            <Box>{meta?.count ?? 'N/A'}</Box>
                        </Text>
                    </Group>
                </List.Item>
                <List.Item>
                    <Group align='center'>
                        <Text fz='md'><strong>Cache Size (MB)</strong>:&nbsp;
                            <Box>{(meta?.size == null || meta?.size === 0) ? 'N/A' : (meta?.size / 1024 / 1024).toFixed(2)}</Box>
                        </Text>
                    </Group>
                </List.Item>
            </List>
        </Box>
    );
};
