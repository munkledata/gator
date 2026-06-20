import React, { useRef } from 'react';
import {
    Box,
    Divider,
    Flex,
    Stack,
    Text,
    Menu,
    Button,
    Popover,
    Card,
    Anchor
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { BsChevronDown } from 'react-icons/bs';
import { AiOutlineInfoCircle, AiOutlinePlus } from 'react-icons/ai';
import { WebhooksTable } from '../../components/tables/WebhooksTable';
import { AddWebhookDialog } from '../../components/modals/AddWebhookDialog';
import { useAppSelector } from '../../hooks';


export const ApiLayout = (): JSX.Element => {
    const dialogRef = useRef(null);
    const [dialogOpen, setDialogOpen] = useDisclosure();
    const webhooks = useAppSelector(state => state.webhookStore.webhooks);

    return (
        <Box p={12} style={{ borderRadius: 10 }}>
            <Flex style={{ flexDirection: 'column' }}>
                <Stack p={20}>
                    <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Text fz='2xl'>API</Text>
                        <Popover withArrow>
                            <Popover.Target>
                                <Box ml={8}>
                                    <AiOutlineInfoCircle />
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text fw={600} mb='xs'>Information</Text>
                                <Box>
                                    <Text>
                                        Learn how you can interact with the API to automate and orchestrate iMessage-related
                                        actions. Our REST API gives you access to the underlying iMessage API in a
                                        more succinct and easy to digest way. We also offer webhooks so you can receive
                                        callbacks from the server.
                                    </Text>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                    </Flex>
                    <Divider orientation='horizontal' />
                    <Text>
                        Gator offers a high-level REST API to interact with the server, as well as iMessage itself.
                        With the API, you'll be able to send messages, fetch messages, filter chats, and more! To see what
                        else you can do in the API, please see the documentation below:
                    </Text>
                    <Box style={{ flex: 1 }} />
                    <Card withBorder radius='md' padding='md' maw={420}>
                        <Text fz='xs' c='dimmed' lineClamp={1}>
                            https://documenter.getpostman.com
                        </Text>
                        <Anchor href='https://documenter.getpostman.com/view/765844/UV5RnfwM' target='_blank' fw={600} fz='lg' mt={4} style={{ display: 'inline-block' }}>
                            Click to view API documentation
                        </Anchor>
                    </Card>

                </Stack>
                <Stack p={20}>
                    <Flex style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Text fz='2xl'>Webhooks</Text>
                        <Popover withArrow>
                            <Popover.Target>
                                <Box ml={8}>
                                    <AiOutlineInfoCircle />
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text fw={600} mb='xs'>Information</Text>
                                <Box>
                                    <Text>
                                        Any webhooks registered here will receive a POST request whenever an iMessage event
                                        occurs. The body of the POST request will be a JSON payload containing the type of
                                        event and the event data.
                                    </Text>
                                </Box>
                            </Popover.Dropdown>
                        </Popover>
                    </Flex>
                    <Divider orientation='horizontal' />
                    <Box style={{ flex: 1 }} />
                    <Box>
                        <Menu>
                            <Menu.Target>
                                <Button variant="default" rightSection={<BsChevronDown />} w="12em">
                                    Manage
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item leftSection={<AiOutlinePlus />} onClick={setDialogOpen.open}>
                                    Add Webhook
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Box>
                    <Box style={{ flex: 1 }} />
                    <WebhooksTable webhooks={webhooks} />
                </Stack>
            </Flex>

            <AddWebhookDialog
                modalRef={dialogRef}
                isOpen={dialogOpen}
                onClose={() => setDialogOpen.close()}
            />
        </Box>
    );
};
