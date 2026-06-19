import React from 'react';
import {
    ActionIcon,
    Box,
    Flex,
    Group,
    Anchor,
    Text,
    Tooltip,
    Switch,
    Divider,
    useMantineColorScheme
} from '@mantine/core';
import { FiGithub, FiMessageCircle } from 'react-icons/fi';
import { FaDiscord } from 'react-icons/fa';
import { AiOutlineHome } from 'react-icons/ai';
import { MdOutlineAttachMoney, MdOutlineLightMode, MdOutlineDarkMode } from 'react-icons/md';
import { WalkthroughLayout } from '../../layouts/walkthrough/WalkthroughLayout';
import logo from '../../../images/logo/icon-64.png';


export const Setup = (): JSX.Element => {
    return (
        <Box h="100%">
            <NavBar />
            <Box p="2">
                <WalkthroughLayout />
            </Box>
        </Box>
    );
};

const NavBar = (): JSX.Element => {
    const { colorScheme, colorScheme: colorMode, toggleColorScheme: toggleColorMode } = useMantineColorScheme();

    return (
        <Flex
            h="20"
            align="center"
            justify="space-between"
            p={16}
            pl={24}
            style={{
                borderBottomWidth: '1px',
                borderBottomColor: colorScheme === 'dark' ? 'gray.7' : 'gray.2'
            }}
        >
            <Flex align="center" justify="flex-start">
                <img src={logo} className="logo" alt="logo" height={48} />
                <Text fz="1xl" ml={8}>BlueBubbles</Text>
            </Flex>
            <Flex justify="flex-end">
                <Group>
                    <Tooltip label="Website Home" aria-label="website-tip" withArrow>
                        <Anchor href="https://bluebubbles.app" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="ghost" aria-label="website"><AiOutlineHome /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="BlueBubbles Web" aria-label="website-tip" withArrow>
                        <Anchor href="https://bluebubbles.app/web" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="ghost" aria-label="bluebubbles web"><FiMessageCircle /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Support Us" aria-label="donate-tip" withArrow>
                        <Anchor href="https://bluebubbles.app/donate" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="ghost" aria-label="donate"><MdOutlineAttachMoney /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Join our Discord" aria-label="discord-tip" withArrow>
                        <Anchor href="https://discord.gg/yC4wr38" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="ghost" aria-label="discord"><FaDiscord /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Read our Source Code" aria-label="github-tip" withArrow>
                        <Anchor href="https://github.com/BlueBubblesApp" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="ghost" aria-label="github"><FiGithub /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Box style={{ flex: 1 }} />
                    <Divider orientation="vertical" w={1} h={15} style={{ borderColor: 'gray' }} />
                    <Box style={{ flex: 1 }} />
                    <Box style={{ flex: 1 }} />
                    <Box style={{ flex: 1 }} />
                    <Box style={{ display: 'flex', alignItems: 'center' }}>
                        <Box mr={8}><MdOutlineDarkMode size={20} /></Box>
                        <Switch id='theme-mode-toggle' onChange={toggleColorMode} checked={colorMode === 'light'} />
                        <Box ml={8}><MdOutlineLightMode size={20} /></Box>
                    </Box>
                </Group>
            </Flex>
        </Flex>
    );
};
