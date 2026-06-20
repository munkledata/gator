import React from 'react';
import { HashRouter as Router, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom';
import type { AnyAction } from '@reduxjs/toolkit';
import {
    ActionIcon,
    Box,
    CloseButton,
    Flex,
    Group,
    Anchor,
    Drawer,
    Text,
    Tooltip,
    useMantineColorScheme,
    Menu,
    Button,
    Badge,
    BoxProps,
    FlexProps
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { FiHome, FiSettings, FiMenu, FiBell, FiTrash } from 'react-icons/fi';
import { FaGoogle } from 'react-icons/fa';
import { AiOutlineBug, AiOutlineHome, AiOutlineApi } from 'react-icons/ai';
import { BsChevronDown, BsCheckAll, BsBook, BsPersonCircle, BsFillCalendarCheckFill, BsPhone } from 'react-icons/bs';
import { IconType } from 'react-icons';

import { ContactsLayout } from 'app/layouts/contacts/ContactsLayout';

import { HomeLayout } from '../../layouts/home/HomeLayout';
import { DevicesLayout } from '../../layouts/devices/DevicesLayout';
import { LogsLayout } from '../../layouts/logs/LogsLayout';
import { SettingsLayout } from '../../layouts/settings/SettingsLayout';
import { NotificationsLayout } from '../../layouts/notifications/NotificationsLayout';
import { ApiLayout } from '../../layouts/api/ApiLayout';
import { GuidesLayout } from '../../layouts/guides/GuidesLayout';
import logo from '../../../images/logo/icon-64.png';
import { NotificationsTable } from '../../components/tables/NotificationsTable';
import './styles.css';

import { useAppSelector, useAppDispatch } from '../../hooks';
import { readAll, clear as clearAlerts, NotificationItem } from '../../slices/NotificationsSlice';
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
    { name: 'Scheduled Messages', icon: BsFillCalendarCheckFill, to: '/scheduled-messages' },
    { name: 'API & Webhooks', icon: AiOutlineApi, to: '/webhooks' },
    { name: 'Debug & Logs', icon: AiOutlineBug, to: '/logs' },
    { name: 'Guides & Links', icon: BsBook, to: '/guides' },
    { name: 'Settings', icon: FiSettings, to: '/settings' }
];

const closeNotification = (closeFunc: () => void, dispatch: React.Dispatch<AnyAction>) => {
    dispatch(readAll());
    closeFunc();
};

export const Navigation = (): JSX.Element => {
    const [isOpen, { open: onOpen, close: onClose }] = useDisclosure();
    const [
        isNotificationsOpen,
        { open: onNotificationOpen, close: onNotificationClose }
    ] = useDisclosure();

    const notifications: Array<NotificationItem> = useAppSelector(state => state.notificationStore.notifications);
    const unreadCount = notifications.filter(e => !e.read).length;
    const dispatch = useAppDispatch();

    return (
        <Box mih="100vh">
            <Router>
                <SidebarContent onClose={() => onClose} />
                <Drawer
                    opened={isOpen}
                    position="left"
                    onClose={onClose}
                    size="full"
                    {...{ autoFocus: false, returnFocusOnClose: false, onOverlayClick: onClose } as any}
                >
                    <Box>
                        <SidebarContent onClose={onClose} />
                    </Box>
                </Drawer>
                {/* mobilenav */}
                <MobileNav onOpen={onOpen} onNotificationOpen={onNotificationOpen} unreadCount={unreadCount} />
                <Box ml={256} p="md">
                    <Routes>
                        <Route path="/settings" element={<SettingsLayout />} />
                        <Route path="/logs" element={<LogsLayout />} />
                        <Route path="/contacts" element={<ContactsLayout />} />
                        <Route path="/notifications" element={<NotificationsLayout />} />
                        <Route path="/devices" element={<DevicesLayout />} />
                        <Route path="/scheduled-messages" element={<ScheduledMessagesLayout />} />
                        <Route path="/webhooks" element={<ApiLayout />} />
                        <Route path="/guides" element={<GuidesLayout />} />
                        <Route path="/" element={<HomeLayout />} />
                    </Routes>
                </Box>
            </Router>

            <Drawer
                onClose={() => closeNotification(onNotificationClose, dispatch)}
                opened={isNotificationsOpen}
                size="lg"
                title={`Notifications / Alerts (${unreadCount})`}
            >
                <Box style={{ overflowWrap: 'break-word' }}>
                    <Menu>
                        <Menu.Target>
                            <Button
                                variant="default"
                                rightSection={<BsChevronDown />}
                                w="12em"
                                mr={20}
                                mb={16}
                            >
                                Manage
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item leftSection={<FiTrash />} onClick={() => {
                                dispatch(clearAlerts({ showToast: true }));
                            }}>
                                Clear Alerts
                            </Menu.Item>
                            <Menu.Item leftSection={<BsCheckAll />} onClick={() => {
                                dispatch(readAll());
                            }}>
                                Mark All as Read
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                    <NotificationsTable notifications={notifications} />
                </Box>
            </Drawer>
        </Box>
    );
};

interface SidebarProps extends BoxProps {
    onClose: () => void;
}

const SidebarContent = ({ onClose, display, ...rest }: SidebarProps) => {
    const { colorScheme } = useMantineColorScheme();
    return (
        <Box
            miw='16em'
            w={60}
            pos="fixed"
            h="full"
            style={{
                borderRight: '1px',
                borderRightColor: (colorScheme === 'dark' ? 'gray.700' : 'gray.200'),
                display
            } as unknown as React.CSSProperties}
            {...rest}
        >
            <Flex h="20" align="center" mx="6" justify="flex-start">
                <img src={logo} className="logo" alt="logo" height={48} />
                <Text fz="1xl" ml={8}>BlueBubbles</Text>
                <CloseButton className="mobile-only" onClick={onClose} />
            </Flex>
            {LinkItems.map(link => (
                <RouterLink key={link.name} to={link.to} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <NavItem icon={link.icon} to={link.to}>{link.name}</NavItem>
                </RouterLink>
            ))}
        </Box>
    );
};

interface NavItemProps extends FlexProps {
    icon: IconType;
    to: string;
    children: string | number;
}
const NavItem = ({ icon: IconComp, to, children, ...rest }: NavItemProps) => {
    const location = useLocation();
    return (
        <Flex
            align="center"
            p="4"
            mx="4"
            role="group"
            c={location.pathname === to ? 'brand.4' : 'gray.3'}
            style={{
                borderRadius: 'lg',
                cursor: 'pointer'
            }}
            {...rest}
        >
            {IconComp && (
                <IconComp {...{ mr: '4', fontSize: '16' } as any} />
            )}
            {children}
        </Flex>
    );
};

interface MobileProps extends FlexProps {
    onOpen: () => void;
    onNotificationOpen: () => void;
    unreadCount: number;
}
const MobileNav = ({ onOpen, onNotificationOpen, unreadCount, ...rest }: MobileProps) => {
    const { colorScheme } = useMantineColorScheme();
    const bgColor = 'gray.8';

    return (
        <Flex
            ml={256}
            px={4}
            h="20"
            align="center"
            bg={bgColor}
            style={{
                borderBottomWidth: '1px',
                borderBottomColor: (colorScheme === 'dark' ? 'gray.700' : 'gray.200'),
                justifyContent: { base: 'space-between', md: 'flex-end' },
                position: 'sticky',
                top: '0',
                zIndex: 'sticky'
            } as unknown as React.CSSProperties}
            {...rest}
        >
            <ActionIcon
                onClick={onOpen}
                variant="subtle"
                aria-label="open menu"
                className="mobile-only"
            >
                <FiMenu />
            </ActionIcon>

            <Text fz="2xl" fw="bold" className="mobile-only" {...{ fontFamily: 'monospace' } as any}>
                <img style={{ minWidth: '48px' }} src={logo} className="logo-small" alt="logo" />
            </Text>

            <Group>
                <Tooltip label="Website Home" aria-label="website-tip" withArrow>
                    <Anchor href="https://bluebubbles.app" style={{ textDecoration: 'none' }} target="_blank">
                        <ActionIcon size="lg" variant="subtle" aria-label="website">
                            <AiOutlineHome />
                        </ActionIcon>
                    </Anchor>
                </Tooltip>
                <Box style={{ position: 'relative', float: 'left' }}>
                    <ActionIcon
                        size="lg"
                        variant="subtle"
                        aria-label="notifications"
                        onClick={() => onNotificationOpen()}
                        style={{ verticalAlign: 'middle', zIndex: 1 }}
                    >
                        <FiBell />
                    </ActionIcon>
                    {(unreadCount > 0) ? (
                        <Badge
                            variant='solid'
                            color='red'
                            m={0}
                            miw={5}
                            mih={5}
                            ta={'center'}
                            style={{
                                borderRadius: 10,
                                position: 'absolute',
                                top: 1,
                                right: 1,
                                zIndex: 2
                            }}
                        >{unreadCount}</Badge>
                    ) : null}
                </Box>
            </Group>
        </Flex>
    );
};
