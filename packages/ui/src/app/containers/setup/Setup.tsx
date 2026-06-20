import React from 'react';
import {
    ActionIcon,
    Box,
    Flex,
    Group,
    Anchor,
    Text,
    Tooltip
} from '@mantine/core';
import { FiGithub, FiMessageCircle } from 'react-icons/fi';
import { FaDiscord } from 'react-icons/fa';
import { AiOutlineHome } from 'react-icons/ai';
import { MdOutlineAttachMoney } from 'react-icons/md';
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
    return (
        <Flex
            h="20"
            align="center"
            justify="space-between"
            p={16}
            pl={24}
            style={{
                borderBottom: '1px solid var(--mantine-color-dark-4)'
            }}
        >
            <Flex align="center" justify="flex-start">
                <img src={logo} className="logo" alt="logo" height={48} />
                <Text fz="1xl" ml={8}>Gator</Text>
            </Flex>
            <Flex justify="flex-end">
                <Group>
                    <Tooltip label="Website Home" aria-label="website-tip" withArrow>
                        <Anchor href="https://bluebubbles.app" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="subtle" aria-label="website"><AiOutlineHome /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Gator Web" aria-label="website-tip" withArrow>
                        <Anchor href="https://bluebubbles.app/web" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="subtle" aria-label="gator web"><FiMessageCircle /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Support Us" aria-label="donate-tip" withArrow>
                        <Anchor href="https://bluebubbles.app/donate" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="subtle" aria-label="donate"><MdOutlineAttachMoney /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Join our Discord" aria-label="discord-tip" withArrow>
                        <Anchor href="https://discord.gg/yC4wr38" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="subtle" aria-label="discord"><FaDiscord /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                    <Tooltip label="Read our Source Code" aria-label="github-tip" withArrow>
                        <Anchor href="https://github.com/BlueBubblesApp" style={{ textDecoration: 'none' }} target="_blank">
                            <ActionIcon size="lg" variant="subtle" aria-label="github"><FiGithub /></ActionIcon>
                        </Anchor>
                    </Tooltip>
                </Group>
            </Flex>
        </Flex>
    );
};
