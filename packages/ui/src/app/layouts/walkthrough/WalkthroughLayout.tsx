import React, { useEffect, useState } from 'react';
import {
    Box,
    Divider,
    Popover,
    Stack,
    Slider,
    Text,
    Button,
    Flex
} from '@mantine/core';
import { IntroWalkthrough } from './intro/IntroWalkthrough';
import { ConnectionWalkthrough } from './connection/ConnectionWalkthrough';
import { PrivateApiWalkthrough } from './privateApi/PrivateApiWalkthrough';
import { ConfigurationsWalkthrough } from './configurations/ConfigurationsWalkthrough';
import { PermissionsWalkthrough } from './permissions/PermissionsWalkthrough';
import { NotificationsWalkthrough } from './notifications/NotificationsWalkthrough';
import { useAppSelector } from '../../hooks';
import { toggleTutorialCompleted } from '../../actions/GeneralActions';
import { useBackground } from '../../hooks/UseBackground';

type StepItem = {
    component: React.FunctionComponent<any>,
    dependencies: Array<string>
};

export const WalkthroughLayout = ({...rest}): JSX.Element => {
    const [step, setStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState([] as Array<number>);
    const proxyService: string = useAppSelector(state => state.config.proxy_service ?? '');
    const password: string = useAppSelector(state => state.config.password ?? '');
    const bgColor = useBackground();

    // Links walkthrough steps and the values they rely on to be completed
    const steps: Array<StepItem> = [
        {
            component: IntroWalkthrough,
            dependencies: []
        },
        {
            component: PermissionsWalkthrough,
            dependencies: []
        },
        {
            component: NotificationsWalkthrough,
            dependencies: []
        },
        {
            component: ConnectionWalkthrough,
            dependencies: [proxyService, password]
        },
        {
            component: PrivateApiWalkthrough,
            dependencies: []
        },
        {
            component: ConfigurationsWalkthrough,
            dependencies: []
        }
    ];

    const CurrentStep = steps[step].component;
    const requiresDependencies = steps[step].dependencies.filter(e => e.length > 0).length !== steps[step].dependencies.length;
    const showNext = step < steps.length && !requiresDependencies;
    const showPrevious = step > 0;

    // Make sure we start at the top
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const nextButton = (
        <Button
            disabled={!showNext}
            mt='20px'
            color='blue'
            onClick={() => {
                if (step === steps.length - 1) {
                    toggleTutorialCompleted(true);
                } else {
                    setStep(step + 1);
                }

            }}
        >
            {step === steps.length - 1 ? 'Finish' : 'Next'} &gt;
        </Button>
    );

    return (
        <Box p={12} {...rest}>
            <Box mb='80px'>
                <CurrentStep onComplete={() => {
                    setCompletedSteps([...completedSteps, step]);
                }}/>
            </Box>
            <Box w='100%' h='80px' bg={bgColor} style={{ position: 'fixed', bottom: 0, left: 0 }}>
                <Divider />
                <Flex justify='space-between' align='center' mx={20}>
                    <Button
                        disabled={!showPrevious}
                        mt='20px'
                        onClick={() => setStep(step - 1)}
                    >
                        &lt; Back
                    </Button>
                    <Stack w='70%'>
                        <Slider aria-label='slider-ex-6' value={step * 20} />
                    </Stack>
                    {/* Step 3 is the connection step */}
                    {(step === 3 && password.length === 0) ? (
                        <Popover defaultOpened={true} withArrow>
                            <Popover.Target>
                                {nextButton}
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text fw={600} mb="xs">Requirements</Text>
                                <Box>
                                    <Text>Enter a password and save it (using the floppy disk button) to proceed</Text>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                    ) : nextButton}
                </Flex>
            </Box>

        </Box>
    );
};
