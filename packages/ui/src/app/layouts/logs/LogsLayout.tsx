import React, { useRef, useState } from 'react';
import {
    Box,
    Divider,
    Flex,
    Stack,
    Text,
    Menu,
    Button,
    Checkbox,
    Popover
} from '@mantine/core';
import { BsChevronDown, BsBootstrapReboot, BsTerminal } from 'react-icons/bs';
import { VscDebugRestart } from 'react-icons/vsc';
import { AiOutlineClear, AiOutlineInfoCircle } from 'react-icons/ai';
import { GoFileSubmodule } from 'react-icons/go';
import { FiExternalLink, FiCopy } from 'react-icons/fi';
import { store } from '../../store';
import { LogsTable } from '../../components/tables/LogsTable';
import { ConfirmationItems } from '../../utils/ToastUtils';
import { ConfirmationDialog } from '../../components/modals/ConfirmationDialog';
import { clearEventCache } from '../../actions/DebugActions';
import { hasKey, copyToClipboard } from '../../utils/GenericUtils';
import { useAppSelector , useAppDispatch} from '../../hooks';
import { AnyAction } from '@reduxjs/toolkit';
import { clear as clearLogs, setDebug, setMessagesAppLogs } from '../../slices/LogsSlice';
import {
    openLogLocation,
    openAppLocation,
    restartViaTerminal,
    restartServices,
    fullRestart,
    getBinaryPath,
} from '../../utils/IpcUtils';


const copyBinaryPath = async () => {
    const path = await getBinaryPath();
    copyToClipboard(path);
};


const confirmationActions: ConfirmationItems = {
    clearEventCache: {
        message: (
            'Are you sure you want to clear your event cache?<br /><br />' +
            'Doing so will not necessarily break anything. However, this ' +
            'should only really be used if you are not receiving new message ' +
            'notifications to your device'
        ),
        func: clearEventCache
    },
    restartViaTerminal: {
        message: (
            'Are you sure you want to restart via terminal?<br /><br />' +
            'Doing so will stop the server, close the server, then ' +
            'restart it in a terminal window. ' +
            'This may help with debugging by allowing you to view the raw server logs.'
        ),
        func: restartViaTerminal
    },
    restartServices: {
        message: (
            'Are you sure you want to restart services?<br /><br />' +
            'This will restart services such as the HTTP service, ' +
            'the Private API service, the proxy services, and more.'
        ),
        func: restartServices
    },
    fullRestart: {
        message: (
            'Are you sure you want to perform a full restart?<br /><br />' +
            'This will close and re-open the BlueBubbles Server'
        ),
        func: fullRestart
    }
};

export const LogsLayout = (): JSX.Element => {
    const dispatch = useAppDispatch();
    const [requiresConfirmation, confirm] = useState((): string | null => {
        return null;
    });
    const alertRef = useRef(null);
    let logs = useAppSelector(state => state.logStore.logs);
    const showDebug = useAppSelector(state => state.logStore.debug);
    const showMessagesAppLogs = useAppSelector(state => state.logStore.messagesAppLogs);

    // If we don't want to show debug logs, filter them out
    if (!showDebug) {
        logs = logs.filter(e => e.type !== 'debug');
    }

    // If we don't want to show messages app logs, filter them out
    if (!showMessagesAppLogs) {
        logs = logs.filter(e => !e.message.startsWith('[Messages] [std'));
    }

    const toggleDebugMode = (e: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setDebug(e.target.checked));
    };

    const toggleMessagesAppLogs = (e: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setMessagesAppLogs(e.target.checked));
    };

    return (
        <Box p={12} style={{ borderRadius: 10 }}>
            <Flex style={{ flexDirection: 'column' }}>
                <Stack p={20}>
                    <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Text fz='2xl'>Controls</Text>
                        <Popover withArrow>
                            <Popover.Target>
                                <Box ml={8}>
                                    <AiOutlineInfoCircle />
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text fw={600} mb="xs">Information</Text>
                                <Box>
                                    <Text>
                                        This page will allow you to perform debugging actions on your BlueBubbles server.
                                        As many of you know, software is not perfect, and there will always be edge cases
                                        depending on the environment. These controls allow us to get the information needed, or
                                        take the required actions to solve an issue. It also allows you to "see" into what
                                        the server is doing in the background.
                                    </Text>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                    </Flex>
                    <Divider orientation='horizontal' />
                    <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
                        <Menu>
                            <Menu.Target>
                                <Button
                                    variant="default"
                                    rightSection={<BsChevronDown />}
                                    w="12em"
                                    mr={20}
                                >
                                    Manage
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item leftSection={<VscDebugRestart />} onClick={() => confirm('restartServices')}>
                                    Restart Services
                                </Menu.Item>
                                <Menu.Item leftSection={<BsBootstrapReboot />} onClick={() => confirm('fullRestart')}>
                                    Full Restart
                                </Menu.Item>
                                <Menu.Item leftSection={<FiExternalLink />} onClick={() => openLogLocation()}>
                                    Open Log Location
                                </Menu.Item>
                                <Menu.Item leftSection={<GoFileSubmodule />} onClick={() => openAppLocation()}>
                                    Open App Location
                                </Menu.Item>
                                <Menu.Item leftSection={<FiCopy />} onClick={() => copyBinaryPath()}>
                                    Copy Binary Path
                                </Menu.Item>
                                <Menu.Item leftSection={<AiOutlineClear />} onClick={() => store.dispatch(clearLogs())}>
                                    Clear Logs
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Menu>
                            <Menu.Target>
                                <Button
                                    variant="default"
                                    rightSection={<BsChevronDown />}
                                    w="12em"
                                    mr={20}
                                >
                                    Debug Actions
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item leftSection={<BsTerminal />} onClick={() => confirm('restartViaTerminal')}>
                                    Restart via Terminal
                                </Menu.Item>
                                <Menu.Item leftSection={<AiOutlineClear />} onClick={() => confirm('clearEventCache')}>
                                    Clear Event Cache
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>

                    </Flex>
                </Stack>
                <Stack p={20}>
                    <Text fz='2xl'>Debug Logs</Text>
                    <Divider orientation='horizontal' />
                    <Box style={{ flex: 1 }} />
                    <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Checkbox onChange={(e: any) => toggleDebugMode(e)} checked={showDebug} label="Show Debug Logs" />
                        <Popover withArrow>
                            <Popover.Target>
                                <Box ml={8}>
                                    <AiOutlineInfoCircle />
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text fw={600} mb="xs">Information</Text>
                                <Box>
                                    <Text>
                                        Enabling this option will show DEBUG level logs. Leaving
                                        this disabled will only INFO, WARN, and ERROR level logs.
                                    </Text>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                        <Box ml={20} />
                        <Checkbox onChange={(e: any) => toggleMessagesAppLogs(e)} checked={showMessagesAppLogs} label="Show Messages App Logs" />
                        <Popover withArrow>
                            <Popover.Target>
                                <Box ml={8}>
                                    <AiOutlineInfoCircle />
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text fw={600} mb="xs">Information</Text>
                                <Box>
                                    <Text>
                                        Enabling this option will show logs coming from the Messages app.
                                        This is disabled by default, as it can be quite verbose.
                                    </Text>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                    </Flex>
                    <Box style={{ flex: 1 }} />
                    <LogsTable logs={logs} />
                </Stack>
            </Flex>

            <ConfirmationDialog
                modalRef={alertRef}
                onClose={() => confirm(null)}
                body={confirmationActions[requiresConfirmation as string]?.message}
                onAccept={() => {
                    if (hasKey(confirmationActions, requiresConfirmation as string)) {
                        if (confirmationActions[requiresConfirmation as string].shouldDispatch ?? false) {
                            dispatch(confirmationActions[requiresConfirmation as string].func() as AnyAction);
                        } else {
                            confirmationActions[requiresConfirmation as string].func();
                        }
                    }
                }}
                isOpen={requiresConfirmation !== null}
            />
        </Box>
    );
};
