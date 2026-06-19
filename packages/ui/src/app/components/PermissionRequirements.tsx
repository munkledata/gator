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
import { checkPermissions, openAccessibilityPrefs, openFullDiskPrefs } from '../utils/IpcUtils';
import { store } from '../store';
import { setConfig } from '../slices/ConfigSlice';
import { BsGear } from 'react-icons/bs';


type RequirementsItem = {
    name: string;
    pass: boolean;
    solution: string;
};

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;


export const PermissionRequirements = (): JSX.Element => {
    const { colorScheme } = useMantineColorScheme();
    const permissions: Array<RequirementsItem> = (useAppSelector(state => state.config.permissions) ?? []);
    const [showProgress, setShowProgress] = useDisclosure();
    const [showAccessibilityProgress, setShowAccessibilityProgress] = useDisclosure();

    const refreshRequirements = () => {
        setShowProgress.open();
        checkPermissions().then(permissions => {
            // I like longer spinning
            setTimeout(() => {
                setShowProgress.close();
            }, 1000);

            if (!permissions) return;
            store.dispatch(setConfig({ name: 'permissions', value: permissions }));
        });
    };

    return (
        <Box style={{ border: '1px solid', borderColor: colorScheme === 'dark' ? 'gray.7' : 'gray.2', borderRadius: 'xl' }} p={12} w='350px'>
            <Group align='center'>
                <Text fz='lg' fw='bold'>macOS Permissions</Text>
                <Box
                    style={{ animation: showProgress ? `${spin} infinite 1s linear` : undefined }}
                    onClick={refreshRequirements}
                >
                    <BiRefresh />
                </Box>
            </Group>
            <List mt={8} ml={32}>
                {permissions.map(e => (
                    <List.Item key={e.name}>
                        <Group align='center'>
                            <Text fz='md'><strong>{e.name}</strong>:&nbsp;
                                <Box c={e.pass ? 'green' : 'red'}>{e.pass ? 'Pass' : 'Fail'}</Box>
                            </Text>
                            {(!e.pass) ? (
                                <>
                                    <Popover withArrow>
                                        <Popover.Target>
                                            <Box ml={8}>
                                                <AiOutlineInfoCircle />
                                            </Box>
                                        </Popover.Target>
                                        <Popover.Dropdown>
                                            <Text fw={600} mb="xs">How to Fix</Text>
                                            <Box>
                                                <Text>
                                                    {e.solution}
                                                </Text>
                                            </Box>
                                        </Popover.Dropdown>
                                    </Popover>
                                    <Box
                                        style={{ animation: showAccessibilityProgress ? `${spin} infinite 1s linear` : undefined }}
                                        onClick={() => {
                                            setShowAccessibilityProgress.open();
                                            setTimeout(() => {
                                                setShowAccessibilityProgress.close();
                                            }, 1000);

                                            if (e.name === 'Accessibility') {
                                                openAccessibilityPrefs();
                                            } else if (e.name === 'Full Disk Access') {
                                                openFullDiskPrefs();
                                            }
                                        }}
                                    >
                                        <BsGear />
                                    </Box>
                                </>
                            ): null}
                        </Group>
                    </List.Item>
                ))}
            </List>
        </Box>
    );
};
