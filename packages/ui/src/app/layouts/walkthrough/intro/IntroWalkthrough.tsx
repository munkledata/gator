import React from 'react';
import {
    Box,
    Text,
    Title,
    Anchor,
    Group
} from '@mantine/core';

export const IntroWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Welcome to BlueBubbles!</Text>
                <Text fz='md' mt={20}>
                    Hey there, and welcome to the BlueBubbles Server! For starters, BlueBubbles is a cross-platform and
                    open-source ecosystem of apps, enabling the use of iMessage on Android, Web, and PC (Linux and Windows).
                    This Server App is the hub for all your connected devices; allowing you to send messages and receive
                    notifications as you would on an Apple device.
                </Text>
                <Text fz='3xl' mt={40}>Useful Resources</Text>
                <Text fz='md' my={20}>
                    In addition to the links in the navigation bar, use the links below to learn more about BlueBubbles and how to use it!
                </Text>
                <Group wrap='wrap' gap='10px'>
                    <Box>
                        <Box maw='sm' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://bluebubbles.app/install
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://bluebubbles.app/install' target='_blank'>
                                    Installation Guide
                                </Anchor>
                            </Title>
                            <Text>
                                Let us help walk you through the full setup of BlueBubbles. This guide will take you step
                                by step to set up the BlueBubbles Server and connect your devices.
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='sm' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://docs.bluebubbles.app
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://docs.bluebubbles.app' target='_blank'>
                                    Documentation &amp; User Guide
                                </Anchor>
                            </Title>
                            <Text>
                                Read about what BlueBubbles has to offer, how to set it up, and how to use the plethora
                                of features. This documentation also provides more links to other useful articles.
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='sm' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://documenter.getpostman.com
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://documenter.getpostman.com/view/765844/UV5RnfwM' target='_blank'>
                                    REST API
                                </Anchor>
                            </Title>
                            <Text>
                                If you're a developer looking to utilize the REST API to interact with iMessage in unique
                                ways, look no further. Perform automation, orchestration, or basic scripting!
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='sm' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://bluebubbles.app/faq
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://bluebubbles.app/faq' target='_blank'>
                                    FAQ
                                </Anchor>
                            </Title>
                            <Text>
                                If you have any questions, someone else has likely already asked them! View our frequently
                                asked questions to figure out how you may be able to solve an issue.
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='sm' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://bluebubbles.app/web
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://bluebubbles.app/web' target='_blank'>
                                    BlueBubbles Web
                                </Anchor>
                            </Title>
                            <Text>
                                BlueBubbles is not limited to running on your Android device. It can also be run in your
                                browser so you can use it on the go! Connect it to this server once setup is complete.
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='sm' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://bluebubbles.app/donate
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://bluebubbles.app/donate' target='_blank'>
                                    Support Us
                                </Anchor>
                            </Title>
                            <Text>
                                BlueBubbles was created and is currently run by independent engineers in their free time.
                                Any sort of support is greatly appreciated! This can be monetary, or just a review.
                            </Text>
                        </Box>
                    </Box>
                </Group>
            </Box>
        </Box>
    );
};
