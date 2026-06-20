import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Divider,
    Flex,
    Stack,
    Text,
    Menu,
    Button,
    Popover,
} from '@mantine/core';
import { BsChevronDown } from 'react-icons/bs';
import { FiTrash } from 'react-icons/fi';
import { BiRefresh } from 'react-icons/bi';
import { store } from '../../store';
import { DevicesTable } from '../../components/tables/DevicesTable';
import { ConfirmationItems, showSuccessToast } from '../../utils/ToastUtils';
import { ConfirmationDialog } from '../../components/modals/ConfirmationDialog';
import { hasKey } from '../../utils/GenericUtils';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { clear, DeviceItem, addAll as addAllDevices } from '../../slices/DevicesSlice';
import { AnyAction } from '@reduxjs/toolkit';
import { AiOutlineInfoCircle } from 'react-icons/ai';
import { getDevices } from '../../utils/IpcUtils';


const confirmationActions: ConfirmationItems = {
    clearDevices: {
        message: (
            'Are you sure you want to clear your registered devices?<br /><br />' +
            'Doing so will mean you will have to re-register your Gator client ' +
            'by restarting the app.'
        ),
        shouldDispatch: true,
        func: clear as (args?: NodeJS.Dict<any>) => void
    }
};

const refreshDevices = (showToast = true) => {
    getDevices().then(devices => {
        if (!devices) return;
    
        const items: Array<DeviceItem> = [];
        for (const item of devices) {
            items.push({ id: item.identifier, name: item.name, lastActive: item.last_active });
        }
    
        store.dispatch(addAllDevices(items));
    });

    if (showToast) {
        showSuccessToast({ id: 'devices', description: 'Successfully refreshed devices!' });
    }
};

export const DevicesLayout = (): JSX.Element => {
    const [requiresConfirmation, confirm] = useState((): string | null => {
        return null;
    });
    const alertRef = useRef(null);
    const devices = useAppSelector(state => state.deviceStore.devices);
    const dispatch = useAppDispatch();
    
    useEffect(() => {
        refreshDevices(false);

        // Refresh devices every 60 seconds
        const refresher = setInterval(() => {
            refreshDevices(false);
        }, 60000);

        // Return a function to clear the interval on unmount
        return () => clearInterval(refresher);
    }, []);

    return (
        <Box p={12} style={{ borderRadius: 10 }}>
            <Stack p={20}>
                <Text fz='2xl'>Controls</Text>
                <Divider orientation='horizontal' />
                <Box>
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
                            <Menu.Item leftSection={<BiRefresh />} onClick={() => refreshDevices()}>
                                Refresh Devices
                            </Menu.Item>
                            <Menu.Item leftSection={<FiTrash />} onClick={() => confirm('clearDevices')}>
                                Clear Devices
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Box>
            </Stack>
            <Stack p={20}>
                <Flex direction='row' justify='flex-start' align='center'>
                    <Text fz='2xl'>Android Devices</Text>
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
                                    Here is where you'll find any devices that are registered with your Gator
                                    server to receive notifications and other messages. If you do not see your device
                                    here after setting up your app, please contact us for assistance.
                                </Text>
                            </Box>
                        </Popover.Dropdown>
                    </Popover>
                </Flex>
                <Divider orientation='horizontal' />
                {(devices.length === 0) ? (
                    <Flex justify="center" align="center">
                        <section style={{marginTop: 20}}>
                            <Text fz="md">You have no devices registered with the server!</Text>
                        </section>
                    </Flex>
                ) : null}
                {(devices.length > 0) ? (
                    <DevicesTable devices={devices} />
                ) : null}
            </Stack>

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