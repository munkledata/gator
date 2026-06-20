import React, { useEffect } from 'react';
import { Box, Stack, Text, Divider, Menu, Button } from '@mantine/core';
import { BsChevronDown, BsCheckAll } from 'react-icons/bs';
import { FiTrash } from 'react-icons/fi';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { readAll, clear as clearAlerts, NotificationItem } from '../../slices/NotificationsSlice';
import { NotificationsTable } from '../../components/tables/NotificationsTable';


export const AlertsLayout = (): JSX.Element => {
    const dispatch = useAppDispatch();
    const notifications: Array<NotificationItem> = useAppSelector(state => state.notificationStore.notifications);
    const unreadCount = notifications.filter(e => !e.read).length;

    // Mark everything read when leaving the page (mirrors the old drawer-close behaviour).
    useEffect(() => {
        return () => {
            dispatch(readAll());
        };
    }, [dispatch]);

    return (
        <Stack p={20}>
            <Text fz='2xl'>Notifications / Alerts{unreadCount > 0 ? ` (${unreadCount})` : ''}</Text>
            <Divider orientation='horizontal' />
            <Box style={{ overflowWrap: 'break-word' }}>
                <Menu>
                    <Menu.Target>
                        <Button variant='default' rightSection={<BsChevronDown />} w='12em' mb={16}>
                            Manage
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item leftSection={<FiTrash />} onClick={() => dispatch(clearAlerts({ showToast: true }))}>
                            Clear Alerts
                        </Menu.Item>
                        <Menu.Item leftSection={<BsCheckAll />} onClick={() => dispatch(readAll())}>
                            Mark All as Read
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                <NotificationsTable notifications={notifications} />
            </Box>
        </Stack>
    );
};
