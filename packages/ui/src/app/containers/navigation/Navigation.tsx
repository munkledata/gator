import React from 'react';
import { HashRouter as Router, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom';
import {
    Box,
    Badge,
    Flex,
    Stack,
    Text,
    FlexProps
} from '@mantine/core';
import { FiHome, FiSettings, FiBell } from 'react-icons/fi';
import { FaGoogle } from 'react-icons/fa';
import { AiOutlineBug, AiOutlineApi } from 'react-icons/ai';
import { BsBook, BsPersonCircle, BsFillCalendarCheckFill, BsPhone } from 'react-icons/bs';
import { IconType } from 'react-icons';

import { ContactsLayout } from 'app/layouts/contacts/ContactsLayout';

import { HomeLayout } from '../../layouts/home/HomeLayout';
import { DevicesLayout } from '../../layouts/devices/DevicesLayout';
import { LogsLayout } from '../../layouts/logs/LogsLayout';
import { SettingsLayout } from '../../layouts/settings/SettingsLayout';
import { NotificationsLayout } from '../../layouts/notifications/NotificationsLayout';
import { ApiLayout } from '../../layouts/api/ApiLayout';
import { GuidesLayout } from '../../layouts/guides/GuidesLayout';
import { AlertsLayout } from '../../layouts/alerts/AlertsLayout';
import logo from '../../../images/logo/icon-64.png';
import './styles.css';

import { useAppSelector } from '../../hooks';
import { NotificationItem } from '../../slices/NotificationsSlice';
import { ScheduledMessagesLayout } from 'app/layouts/scheduledMessages/ScheduledMessagesLayout';

interface LinkItemProps {
    name: string;
    icon: IconType;
    to: string;
}
const LinkItems: Array<LinkItemProps> = [
    { name: 'Home', icon: FiHome, to: '/' },
    { name: 'Contacts', icon: BsPersonCircle, to: '/contacts' },
    { name: 'Android Devices', icon: BsPhone, to: '/devices' },
    { name: 'Notifications', icon: FaGoogle, to: '/notifications' },
    { name: 'Alerts', icon: FiBell, to: '/alerts' },
    { name: 'Scheduled Messages', icon: BsFillCalendarCheckFill, to: '/scheduled-messages' },
    { name: 'API & Webhooks', icon: AiOutlineApi, to: '/webhooks' },
    { name: 'Debug & Logs', icon: AiOutlineBug, to: '/logs' },
    { name: 'Guides & Links', icon: BsBook, to: '/guides' },
    { name: 'Settings', icon: FiSettings, to: '/settings' }
];

export const Navigation = (): JSX.Element => {
    return (
        <Box mih="100vh">
            <Router>
                <SidebarContent />
                <Box ml={256} p="md">
                    <Routes>
                        <Route path="/settings" element={<SettingsLayout />} />
                        <Route path="/logs" element={<LogsLayout />} />
                        <Route path="/contacts" element={<ContactsLayout />} />
                        <Route path="/notifications" element={<NotificationsLayout />} />
                        <Route path="/alerts" element={<AlertsLayout />} />
                        <Route path="/devices" element={<DevicesLayout />} />
                        <Route path="/scheduled-messages" element={<ScheduledMessagesLayout />} />
                        <Route path="/webhooks" element={<ApiLayout />} />
                        <Route path="/guides" element={<GuidesLayout />} />
                        <Route path="/" element={<HomeLayout />} />
                    </Routes>
                </Box>
            </Router>
        </Box>
    );
};

const SidebarContent = (): JSX.Element => {
    const notifications: Array<NotificationItem> = useAppSelector(state => state.notificationStore.notifications);
    const unreadCount = notifications.filter(e => !e.read).length;
    return (
        <Box
            w='16em'
            pos="fixed"
            h="100vh"
            style={{ borderRight: '1px solid var(--mantine-color-dark-4)' }}
        >
            <Flex h={64} align="center" px="md" gap={10} justify="flex-start">
                <img src={logo} className="logo" alt="logo" height={40} />
                <Text fz="xl" fw={700}>Gator</Text>
            </Flex>
            <Stack gap={2} px="xs" mt={4}>
                {LinkItems.map(link => (
                    <RouterLink key={link.name} to={link.to} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <NavItem icon={link.icon} to={link.to} badge={link.to === '/alerts' ? unreadCount : 0}>
                            {link.name}
                        </NavItem>
                    </RouterLink>
                ))}
            </Stack>
        </Box>
    );
};

interface NavItemProps extends FlexProps {
    icon: IconType;
    to: string;
    badge?: number;
    children: string | number;
}
const NavItem = ({ icon: IconComp, to, badge = 0, children, ...rest }: NavItemProps) => {
    const location = useLocation();
    return (
        <Flex
            align="center"
            gap={12}
            px="md"
            py={9}
            role="group"
            className="nav-item"
            c={location.pathname === to ? 'gator.4' : 'gray.3'}
            style={{
                borderRadius: 'var(--mantine-radius-md)',
                cursor: 'pointer'
            }}
            {...rest}
        >
            {IconComp && (
                <IconComp size={18} />
            )}
            {children}
            {(badge > 0) ? (
                <Badge color='red' size='sm' ml='auto'>{badge}</Badge>
            ) : null}
        </Flex>
    );
};
