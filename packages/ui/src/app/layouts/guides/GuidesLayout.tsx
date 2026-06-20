import React from 'react';
import {
    Anchor,
    Box,
    Card,
    Divider,
    SimpleGrid,
    Stack,
    Text
} from '@mantine/core';

interface Guide {
    url: string;
    display: string;
    title: string;
    body: string;
}

const GUIDES: Guide[] = [
    {
        url: 'https://bluebubbles.app/install',
        display: 'https://bluebubbles.app/install',
        title: 'Installation Guide',
        body: 'Let us help walk you through the full setup of BlueBubbles. This guide will take you step by step to set up the BlueBubbles Server and connect your devices.'
    },
    {
        url: 'https://docs.bluebubbles.app',
        display: 'https://docs.bluebubbles.app',
        title: 'Documentation & User Guide',
        body: 'Read about what BlueBubbles has to offer, how to set it up, and how to use the plethora of features. This documentation also provides more links to other useful articles.'
    },
    {
        url: 'https://bluebubbles.app/faq',
        display: 'https://bluebubbles.app/faq',
        title: 'FAQ',
        body: 'If you have any questions, someone else has likely already asked them! View our frequently asked questions to figure out how you may be able to solve an issue.'
    },
    {
        url: 'https://docs.bluebubbles.app/private-api/installation',
        display: 'https://docs.bluebubbles.app/private-api',
        title: 'Private API Setup Guide',
        body: 'If you want to have the ability to send reactions, replies, effects, subjects, etc. Read this guide to figure out how to setup the Private API features.'
    },
    {
        url: 'https://documenter.getpostman.com/view/765844/UV5RnfwM',
        display: 'https://documenter.getpostman.com',
        title: 'REST API',
        body: 'If you\'re a developer looking to utilize the REST API to interact with iMessage in unique ways, look no further. Perform automation, orchestration, or basic scripting!'
    },
    {
        url: 'https://bluebubbles.app/web',
        display: 'https://bluebubbles.app/web',
        title: 'BlueBubbles Web',
        body: 'BlueBubbles is not limited to running on your Android device. It can also be run in your browser so you can use it on the go! Connect it to this server once setup is complete.'
    },
    {
        url: 'https://github.com/sponsors/BlueBubblesApp',
        display: 'https://github.com/sponsors/BlueBubblesApp',
        title: 'Sponsor Us',
        body: 'Sponsor us by contributing a recurring donation to us, through GitHub. A monthly donation is just another way to help support the developers and help maintain the project!'
    },
    {
        url: 'https://bluebubbles.app/donate',
        display: 'https://bluebubbles.app/donate',
        title: 'Support Us',
        body: 'BlueBubbles was created and is currently run by independent engineers in their free time. Any sort of support is greatly appreciated! This can be monetary, or just a review.'
    }
];

export const GuidesLayout = (): JSX.Element => {
    return (
        <Box p={12} style={{ borderRadius: 10 }}>
            <Stack p={20}>
                <Text fz='2xl'>Help Guides &amp; FAQ</Text>
                <Divider orientation='horizontal' />
                <Text fz='md' my={8}>
                    In addition to the links in the navigation bar, use the links below to learn more about BlueBubbles and how to use it!
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing='md' mt={8}>
                    {GUIDES.map(g => (
                        <Card key={g.title} withBorder radius='md' padding='md'>
                            <Text fz='xs' c='dimmed' lineClamp={1}>{g.display}</Text>
                            <Anchor href={g.url} target='_blank' fw={600} fz='lg' mt={4} mb={8} style={{ display: 'inline-block' }}>
                                {g.title}
                            </Anchor>
                            <Text fz='sm'>{g.body}</Text>
                        </Card>
                    ))}
                </SimpleGrid>
            </Stack>
        </Box>
    );
};
