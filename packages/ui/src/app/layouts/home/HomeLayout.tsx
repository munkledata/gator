import React, { useState } from 'react';
import {
    Box,
    Divider,
    Flex,
    SimpleGrid,
    Stack,
    Text,
    ActionIcon,
    Popover,
    List,
    Skeleton,
    Tooltip
} from '@mantine/core';
import QRCode from 'react-qr-code';
import { AiOutlineInfoCircle, AiOutlineQrcode } from 'react-icons/ai';

import './styles.css';
import { useAppSelector } from '../../hooks';
import { buildQrData, copyToClipboard } from '../../utils/GenericUtils';
import { BiCopy } from 'react-icons/bi';
import { TotalMessagesStatBox, TopGroupStatBox, BestFriendStatBox, DailyMessagesStatBox, TotalPicturesStatBox, TotalVideosStatBox } from 'app/components/stats';
import { TimeframeDropdownField } from 'app/components/fields/TimeframeDropdownField';
import { IoIosWarning } from 'react-icons/io';


export const HomeLayout = (): JSX.Element => {
    const address = useAppSelector(state => state.config.server_address);
    const password = useAppSelector(state => state.config.password);
    const port = useAppSelector(state => state.config.socket_port);
    const qrCode: any = buildQrData(password, address);
    const computerId = useAppSelector(state => state.config.computer_id);
    const iMessageEmail = useAppSelector(state => state.config.detected_imessage);
    const [statDays, setStatDays] = useState(180);

    // Only warn if the URL is http://, and not a private IP
    const shouldWarnUrl = address && address.startsWith('http://') &&
        // Private IP Space
        !address.startsWith('http://192.168.') &&
        !address.startsWith('http://10.') &&
        !address.startsWith('http://172.16.') &&
        // Localhost
        !address.startsWith('http://localhost') &&
        !address.startsWith('http://127.0.0.1');

    return (
        <Box p={12} style={{ borderRadius: 10 }}>
            <Flex style={{ flexDirection: 'column' }}>
                <Stack p={20}>
                    <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Text fz='2xl'>Server Information</Text>
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
                                        This page will detail your current connection details. This includes your&nbsp;
                                        server address and your local port.
                                    </Text>
                                    <br />
                                    <List>
                                        <List.Item><strong>Server Address:</strong> This is the address that your clients will connect to</List.Item>
                                        <List.Item><strong>Local Port:</strong> This is the port that the HTTP server is running on,
                                            and the port you will use when port forwarding&nbsp;
                                            for a dynamic DNS
                                        </List.Item>
                                    </List>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                    </Flex>
                    <Divider orientation='horizontal' />
                    <Box style={{ flex: 1 }} />
                    <Flex style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Stack>
                            <Flex style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text fz='md' fw='bold' mr={8}>Server URL: </Text>
                                {(!address) ? (
                                    <Skeleton height={8} radius="sm" />
                                ) : (
                                    <Text fz='md'>{address}</Text>
                                )}
                                {shouldWarnUrl ? (
                                    <Tooltip label='Your connection is not secure! Connecting to any server over HTTP could compromise your data! Your messages could be intercepted by a man-in-the-middle attack. Consider setting up an SSL certificate or changing your setup.' withArrow>
                                        <Box mr={4} ml={12}>
                                            <IoIosWarning color='orange' />
                                        </Box>
                                    </Tooltip>
                                ) : null}
                                <Tooltip label='Copy Address' withArrow>
                                    <ActionIcon
                                        variant="subtle"
                                        ml={12}
                                        size='md'
                                        aria-label='Copy Address'
                                        onClick={() => copyToClipboard(address)}
                                    >
                                        <BiCopy size='22px' />
                                    </ActionIcon>
                                </Tooltip>
                                <Popover position='bottom' withArrow>
                                    <Popover.Target>
                                        <Box ml={8} >
                                            <Tooltip label='Show QR Code' withArrow>
                                                <ActionIcon
                                                    variant="subtle"
                                                    ml={4}
                                                    size='md'
                                                    aria-label='Show QR Code'
                                                >
                                                    <AiOutlineQrcode size='24px' />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Box>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        <Text fw={600} mb="xs">QR Code</Text>
                                        <Box>
                                            <Flex style={{ justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
                                                <Text>
                                                    Your QR Code contains your server configuration so that clients can connect.
                                                    Your QR Code should remain <strong>private</strong> as it contains sensitive information!
                                                </Text>
                                                <Box mt={16} h='266px' w='266px' mb={12} style={{ border: '5px solid white', borderRadius: 'var(--mantine-radius-md)' }}>
                                                    {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                                                    {/* @ts-ignore: ts2876 */}
                                                    {(qrCode) ? <QRCode value={qrCode as string} /> : null}
                                                </Box>
                                            </Flex>
                                        </Box>
                                    </Popover.Dropdown>
                                </Popover>
                            </Flex>
                            <Flex style={{ flexDirection: 'row' }}>
                                <Text fz='md' fw='bold' mr={8}>Local Port: </Text>
                                {(!port) ? (
                                    <Skeleton height={8} radius="sm" />
                                ) : (
                                    <Text fz='md'>{port}</Text>
                                )}
                            </Flex>
                            <Flex pt={8} style={{ flexDirection: 'row' }}>
                                <Text fz='md' fw='bold' mr={8}>iMessage Email: </Text>
                                {(!iMessageEmail) ? (
                                    <Skeleton height={8} radius="sm" />
                                ) : (
                                    <Text fz='md'>{iMessageEmail.length === 0 ? 'Not Detected!' : iMessageEmail}</Text>
                                )}
                            </Flex>
                            <Flex pt={8} style={{ flexDirection: 'row' }}>
                                <Text fz='md' fw='bold' mr={8}>Computer ID: </Text>
                                {(!computerId) ? (
                                    <Skeleton height={8} radius="sm" />
                                ) : (
                                    <Text fz='md'>{computerId}</Text>
                                )}
                            </Flex>
                        </Stack>
                        <Divider orientation="vertical" />
                    </Flex>
                </Stack>
                <Stack pl={20} pr={20} pb={20} pt={8}>
                    <Flex style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                            <Text fz='2xl' miw="fit-content">iMessage Highlights</Text>
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
                                            These are just some fun stats that I included to give you a quick "snapshot"
                                            of your iMessage history on the Mac Device. This does not include messages that
                                            are on Apple's servers, only what is local to this device.
                                        </Text>
                                    </Box>
                                </Popover.Dropdown>
                            </Popover>
                        </Flex>
                        <TimeframeDropdownField
                            onChange={(value: number) => {
                                setStatDays(value);
                            }}
                            selectedDays={statDays}
                        />
                    </Flex>
                    <Divider orientation='horizontal' />
                    <Box style={{ flex: 1 }} />
                    { /* Delays are so older systems do not freeze when requesting data from the databases */ }
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing='md'>
                        <TotalMessagesStatBox pastDays={statDays} />
                        <TopGroupStatBox delay={200} pastDays={statDays} />
                        <BestFriendStatBox delay={400} pastDays={statDays} />
                        <DailyMessagesStatBox delay={600} />
                        <TotalPicturesStatBox delay={800} pastDays={statDays} />
                        <TotalVideosStatBox delay={1000} pastDays={statDays} />
                    </SimpleGrid>
                </Stack>
            </Flex>
        </Box>
    );
};
