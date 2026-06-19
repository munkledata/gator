import React from 'react';
import {
    Box,
    Text,
    Group,
    List,
    Popover,
    useMantineColorScheme
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { keyframes } from '@emotion/react';
import { BiRefresh } from 'react-icons/bi';
import { useAppSelector } from '../hooks';
import { AiOutlineInfoCircle } from 'react-icons/ai';
import { getPrivateApiRequirements } from '../utils/IpcUtils';
import { store } from '../store';
import { setConfig } from '../slices/ConfigSlice';


type RequirementsItem = {
    name: string;
    pass: boolean;
    solution: string;
};

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;


export const PrivateApiRequirements = (): JSX.Element => {
    const requirements: Array<RequirementsItem> = (useAppSelector(state => state.config.private_api_requirements) ?? []);
    const [showProgress, { open: showProgressOn, close: showProgressOff }] = useDisclosure();
    const { colorScheme } = useMantineColorScheme();

    const refreshRequirements = () => {
        showProgressOn();
        getPrivateApiRequirements().then(requirements => {
            // I like longer spinning
            setTimeout(() => {
                showProgressOff();
            }, 1000);

            if (!requirements) return;
            store.dispatch(setConfig({ name: 'private_api_requirements', value: requirements }));
        });
    };

    return (
        <Box style={{ border: '1px solid', borderColor: colorScheme === 'dark' ? 'gray.7' : 'gray.2', borderRadius: 'xl' }} p={12} w='325px'>
            <Group align='center'>
                <Text fz='lg' fw='bold'>Private API Requirements</Text>
                <Box
                    onClick={refreshRequirements}
                    style={{ cursor: 'pointer', animation: showProgress ? `${spin} infinite 1s linear` : undefined }}
                >
                    <BiRefresh />
                </Box>
            </Group>
            <List mt={8} ml={32}>
                {requirements.map(e => (
                    <List.Item key={e.name}>
                        <Group align='center'>
                            <Text fz='md'><strong>{e.name}</strong>:&nbsp;
                                <Box c={e.pass ? 'green' : 'red'}>{e.pass ? 'Pass' : 'Fail'}</Box>
                            </Text>
                            {(!e.pass) ? (
                                <Popover withArrow {...{ trigger: 'hover' }}>
                                    <Popover.Target>
                                        <Box ml={8} style={{ cursor: 'pointer' }}>
                                            <AiOutlineInfoCircle />
                                        </Box>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        <Text fw={600} mb='xs'>How to Fix</Text>
                                        <Box>
                                            <Text>
                                                {e.solution}
                                            </Text>
                                        </Box>
                                    </Popover.Dropdown>
                                </Popover>
                            ): null}
                        </Group>
                    </List.Item>
                ))}
            </List>
        </Box>
    );
};
