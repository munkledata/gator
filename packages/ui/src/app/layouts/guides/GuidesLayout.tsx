import React from 'react';
import {
    Anchor,
    Box,
    Divider,
    Group,
    Stack,
    Text,
    Title
} from '@mantine/core';


export const GuidesLayout = (): JSX.Element => {
    return (
        <Box p={12} style={{ borderRadius: 10 }}>
            <Stack p={20}>
                <Text fz='2xl'>Help Guides &amp; FAQ</Text>
                <Divider orientation='horizontal' />
                <Box style={{ flex: 1 }} />
                <Text fz='md' my={20}>
                    In addition to the links in the navigation bar, use the links below to learn more about BlueBubbles and how to use it!
                </Text>
                <Box style={{ flex: 1 }} />
                <Box style={{ flex: 1 }} />
                <Group wrap='wrap' gap='30px' mt={20}>
                    <Box>
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
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
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
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
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
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
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://docs.bluebubbles.app/private-api
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://docs.bluebubbles.app/private-api/installation' target='_blank'>
                                    Private API Setup Guide
                                </Anchor>
                            </Title>
                            <Text>
                                If you want to have the ability to send reactions, replies, effects, subjects, etc. Read
                                this guide to figure out how to setup the Private API features.
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
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
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
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
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
                            <Text c='gray'>
                                https://github.com/sponsors/BlueBubblesApp
                            </Text>
                            <Title order={4} my={8}>
                                <Anchor href='https://github.com/sponsors/BlueBubblesApp' target='_blank'>
                                    Sponsor Us
                                </Anchor>
                            </Title>
                            <Text>
                                Sponsor us by contributing a recurring donation to us, through GitHub. A monthly donation
                                is just another way to help support the developers and help maintain the project!
                            </Text>
                        </Box>
                    </Box>
                    <Box>
                        <Box maw='xs' px='5' pb={20} pt={8} style={{ borderWidth: '1px', borderRadius: 'xl' }}>
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
            </Stack>
        </Box>
    );
};
