import React from 'react';
import {
    Box,
    Text,
    Anchor,
    Card,
    SimpleGrid
} from '@mantine/core';

interface Resource {
    url: string;
    display: string;
    title: string;
    body: string;
}

const RESOURCES: Resource[] = [
    {
        url: 'https://bluebubbles.app/install',
        display: 'https://bluebubbles.app/install',
        title: 'Installation Guide',
        body: 'Let us help walk you through the full setup of Gator. This guide will take you step by step to set up the Gator Server and connect your devices.'
    },
    {
        url: 'https://docs.bluebubbles.app',
        display: 'https://docs.bluebubbles.app',
        title: 'Documentation & User Guide',
        body: 'Read about what Gator has to offer, how to set it up, and how to use the plethora of features. This documentation also provides more links to other useful articles.'
    },
    {
        url: 'https://documenter.getpostman.com/view/765844/UV5RnfwM',
        display: 'https://documenter.getpostman.com',
        title: 'REST API',
        body: 'If you\'re a developer looking to utilize the REST API to interact with iMessage in unique ways, look no further. Perform automation, orchestration, or basic scripting!'
    },
    {
        url: 'https://bluebubbles.app/faq',
        display: 'https://bluebubbles.app/faq',
        title: 'FAQ',
        body: 'If you have any questions, someone else has likely already asked them! View our frequently asked questions to figure out how you may be able to solve an issue.'
    },
    {
        url: 'https://bluebubbles.app/web',
        display: 'https://bluebubbles.app/web',
        title: 'Gator Web',
        body: 'Gator is not limited to running on your Android device. It can also be run in your browser so you can use it on the go! Connect it to this server once setup is complete.'
    },
    {
        url: 'https://bluebubbles.app/donate',
        display: 'https://bluebubbles.app/donate',
        title: 'Support Us',
        body: 'Gator is built on BlueBubbles, which was created and is run by independent engineers in their free time. Any sort of support is greatly appreciated! This can be monetary, or just a review.'
    }
];

export const IntroWalkthrough = (): JSX.Element => {
    return (
        <Box>
            <Box px={20}>
                <Text fz='4xl'>Welcome to Gator!</Text>
                <Text fz='md' mt={20}>
                    Hey there, and welcome to the Gator Server! For starters, Gator is a cross-platform and
                    open-source ecosystem of apps, enabling the use of iMessage on Android, Web, and PC (Linux and Windows).
                    This Server App is the hub for all your connected devices; allowing you to send messages and receive
                    notifications as you would on an Apple device.
                </Text>
                <Text fz='3xl' mt={40}>Useful Resources</Text>
                <Text fz='md' my={20}>
                    In addition to the links in the navigation bar, use the links below to learn more about Gator and how to use it!
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing='md'>
                    {RESOURCES.map(r => (
                        <Card key={r.title} withBorder radius='md' padding='md'>
                            <Text fz='xs' c='dimmed' lineClamp={1}>{r.display}</Text>
                            <Anchor href={r.url} target='_blank' fw={600} fz='lg' mt={4} mb={8} style={{ display: 'inline-block' }}>
                                {r.title}
                            </Anchor>
                            <Text fz='sm'>{r.body}</Text>
                        </Card>
                    ))}
                </SimpleGrid>
            </Box>
        </Box>
    );
};
