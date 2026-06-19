import React, { useEffect, useRef, useState } from 'react';
import { invoke, onEvent, offEvent } from 'lib/apiClient';
import {
    Box,
    Divider,
    Flex,
    Stack,
    Group,
    Text,
    Popover,
    Loader,
    TextInput,
    Menu,
    Button,
    Anchor,
    Image,
    Pagination
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AiOutlineInfoCircle, AiOutlineSearch } from 'react-icons/ai';
import { BsCheckAll, BsChevronDown, BsPersonPlus, BsUnlockFill } from 'react-icons/bs';
import { BiImport, BiRefresh } from 'react-icons/bi';
import { ContactAddress, ContactItem, ContactsTable } from 'app/components/tables/ContactsTable';
import { ContactDialog } from 'app/components/modals/ContactDialog';
import { addAddressToContact, createContact, deleteContact, deleteContactAddress, deleteLocalContacts, updateContact } from 'app/actions/ContactActions';
import { FiTrash } from 'react-icons/fi';
import { ConfirmationItems, showSuccessToast } from 'app/utils/ToastUtils';
import { ConfirmationDialog } from 'app/components/modals/ConfirmationDialog';
import { waitMs } from 'app/utils/GenericUtils';
import { ProgressStatus } from 'app/types';
import { getContactsOauthUrl, restartOauthService } from 'app/utils/IpcUtils';
import GoogleIcon from '../../../images/walkthrough/google-icon.png';

const perPage = 25;

const buildIdentifier = (contact: ContactItem) => {
    return [
        contact.firstName ?? '', contact.lastName ?? '',
        (contact.phoneNumbers ?? []).map((e) => e.address.replaceAll(/[^a-zA-Z0-9_]/gi, '')).join('|'),
        (contact.emails ?? []).map((e) => e.address.replaceAll(/[^a-zA-Z0-9_]/gi, '')).join('|'),
        contact.displayName ?? ''
    ].join(' ').toLowerCase();
};

const getPermissionColor = (status: string | null): string => {
    if (!status) return 'yellow';
    if (status === 'Authorized') return 'green';
    return 'red';
};

export const ContactsLayout = (): JSX.Element => {
    const [search, setSearch] = useState('' as string);
    const [isLoading, { close: setLoadingOff }] = useDisclosure(true);
    const [contacts, setContacts] = useState([] as any[]);
    const [permission, setPermission] = useState((): string | null => {
        return null;
    });
    const dialogRef = useRef(null);
    const inputFile = useRef(null);
    const [dialogOpen, { open: setDialogOpenOn, close: setDialogOpenOff }] = useDisclosure();
    const alertRef = useRef(null);
    const [requiresConfirmation, confirm] = useState((): string | null => {
        return null;
    });

    const [authStatus, setAuthStatus] = useState(ProgressStatus.NOT_STARTED);
    const [oauthUrl, setOauthUrl] = useState('');

    let filteredContacts = contacts;
    if (search && search.length > 0) {
        filteredContacts = filteredContacts.filter((c) => buildIdentifier(c).includes(search.toLowerCase()));
    }

    const [currentPage, setCurrentPage] = useState(1);
    const pagesCount = Math.ceil(filteredContacts.length / perPage);

    const refreshPermissionStatus = async (): Promise<void> => {
        setPermission(null);
        await waitMs(500);
        invoke('contact-permission-status').then((status: string) => {
            setPermission(status);
        }).catch(() => {
            setPermission('Unknown');
        });
    };

    const requestContactPermission = async (): Promise<void> => {
        setPermission(null);
        invoke('request-contact-permission', true).then((status: string) => {
            setPermission(status);
        }).catch(() => {
            setPermission('Unknown');
        });
    };

    const loadContacts = (showToast = false, extraProps: string[] = ['contactThumbnailImage']) => {
        invoke('get-contacts', extraProps).then((contactList: any[]) => {
            setContacts(contactList.map((e: any) => { 
                // Patch the ID as a string
                e.id = String(e.id);
                return e;
            }));
            setLoadingOff();
        }).catch(() => {
            setLoadingOff();
        });

        if (showToast) {
            showSuccessToast({
                id: 'contacts',
                description: 'Successfully refreshed Contacts!'
            });
        }
    };

    const getOauthIcon = () => {
        if (authStatus === ProgressStatus.IN_PROGRESS) {
            return <Loader size='md' speed='0.65s' />;
        } else if (authStatus === ProgressStatus.COMPLETED) {
            return <BsCheckAll size={24} color='green' />;
        }

        return null;
    };

    useEffect(() => {
        loadContacts();
        refreshPermissionStatus();

        offEvent('oauth-status');
        getContactsOauthUrl().then(url => setOauthUrl(url));

        onEvent('oauth-status', (data: ProgressStatus) => {
            setAuthStatus(data);

            if (data === ProgressStatus.COMPLETED) {
                loadContacts(true);
            }
        });
    }, []);

    const getEmptyContent = () => {
        const wrap = (child: JSX.Element) => {
            return (
                <section style={{marginTop: 20}}>
                    {child}
                </section>
            );
        };

        if (isLoading) {
            return wrap(<Loader />);
        }

        if (contacts.length === 0) {
            return wrap(<Text fz="md">BlueBubbles found no contacts in your Mac's Address Book!</Text>);
        }

        return null;
    };

    const filterContacts = () => {
        return filteredContacts.slice((currentPage - 1) * perPage, currentPage * perPage);
    };

    const onCreate = async (contact: ContactItem) => {
        const newContact = await createContact(
            contact.firstName,
            contact.lastName,
            {
                emails: contact.emails.map((e: NodeJS.Dict<any>) => e.address),
                phoneNumbers: contact.phoneNumbers.map((e: NodeJS.Dict<any>) => e.address)
            }
        );

        if (newContact) {
            // Patch the contact using a string ID & source type
            newContact.id = String(newContact.id);
            newContact.sourceType = 'db';

            // Patch the addresses
            (newContact as any).phoneNumbers = (newContact as any).addresses.filter((e: any) => e.type === 'phone');
            (newContact as any).emails = (newContact as any).addresses.filter((e: any) => e.type === 'email');

            setContacts([newContact, ...contacts]);
        }
    };

    const onUpdate = async (contact: NodeJS.Dict<any>) => {
        const cId = typeof(contact.id) === 'string' ? Number.parseInt(contact.id) : contact.id as number;
        const newContact = await updateContact(
            cId,
            {
                firstName: contact.firstName,
                lastName: contact.lastName,
                displayName: contact.displayName
            }
        );

        const copiedContacts = [...contacts];
        let updated = false;
        for (let i = 0; i < copiedContacts.length; i++) {
            if (copiedContacts[i].id === String(cId)) {
                copiedContacts[i].firstName = newContact.firstName;
                copiedContacts[i].lastName = newContact.lastName;
                copiedContacts[i].displayName = newContact.displayName;
                updated = true;
            }
        }

        if (updated) {
            setContacts(copiedContacts);
        }
    };

    const onDelete = async (contactId: number | string) => {
        await deleteContact(typeof(contactId) === 'string' ? Number.parseInt(contactId as string) : contactId);
        setContacts(contacts.filter((e: ContactItem) => {
            return e.id !== String(contactId);
        }));
    };

    const onAddAddress = async (contactId: number | string, address: string) => {
        const cId = typeof(contactId) === 'string' ? Number.parseInt(contactId as string) : contactId;
        const addr = await addAddressToContact(cId, address, address.includes('@') ? 'email' : 'phone');
        if (addr) {
            setContacts(contacts.map((e: ContactItem) => {
                if (e.id !== String(contactId)) return e;
                if (address.includes('@')) {
                    e.emails = [...e.emails, addr];
                } else {
                    e.phoneNumbers = [...e.phoneNumbers, addr];
                }

                return e;
            }));
        }
    };

    const onDeleteAddress = async (contactAddressId: number) => {
        await deleteContactAddress(contactAddressId);
        setContacts(contacts.map((e: ContactItem) => {
            e.emails = e.emails.filter((e: ContactAddress) => e.id !== contactAddressId);
            e.phoneNumbers = e.phoneNumbers.filter((e: ContactAddress) => e.id !== contactAddressId);
            return e;
        }));
    };

    const clearLocalContacts = async () => {
        // Delete the contacts, then filter out the DB items
        await deleteLocalContacts();
        setContacts(contacts.filter(e => e.sourceType !== 'db'));
    };

    const confirmationActions: ConfirmationItems = {
        clearLocalContacts: {
            message: (
                'Are you sure you want to clear/delete all local Contacts?<br /><br />' +
                'This will remove any Contacts added manually, via the API, or via the import process'
            ),
            func: clearLocalContacts
        }
    };

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
                            <Menu.Item leftSection={<BsPersonPlus />} onClick={() => setDialogOpenOn()}>
                                Add Contact
                            </Menu.Item>
                            <Menu.Item leftSection={<BiRefresh />} onClick={() => loadContacts(true)}>
                                Refresh Contacts
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<BiImport />}
                                onClick={() => {
                                    if (inputFile && inputFile.current) {
                                        (inputFile.current as HTMLElement).click();
                                    }
                                }}
                            >
                                Import VCF
                                <input
                                    type='file'
                                    id='file'
                                    ref={inputFile}
                                    accept=".vcf"
                                    style={{display: 'none'}}
                                    onChange={async (e) => {
                                        const files = e?.target?.files ?? [];
                                        for (const i of files) {
                                            await invoke('import-vcf', i.path);
                                        }

                                        loadContacts();
                                    }}
                                />
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item leftSection={<FiTrash />} onClick={() => confirm('clearLocalContacts')}>
                                Clear Local Contacts
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
                                Permissions
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item leftSection={<BiRefresh />} onClick={() => refreshPermissionStatus()}>
                                Refresh Permission Status
                            </Menu.Item>
                            {(permission !== null && permission !== 'Authorized') ? (
                                <Menu.Item leftSection={<BsUnlockFill />} onClick={() => requestContactPermission()}>
                                    Request Permission
                                </Menu.Item>
                            ) : null}
                        </Menu.Dropdown>
                    </Menu>
                    <Text style={{ verticalAlign: 'middle' }}>
                        Status: <Text c={getPermissionColor(permission)}>
                            {permission ? permission : 'Checking...'}
                        </Text>
                    </Text>
                </Box>
            </Stack>
            <Box ml={20} mr={20}>
                <Text fz='md'>
                    Using the button below, you can authorize BlueBubbles to access your Google Contacts. This will allow BlueBubbles to
                    download your contacts + avatars from Google, and serve them to any connected clients.
                </Text>
                <Anchor
                    href={oauthUrl}
                    target="_blank"
                >
                    <Group align='center'>
                        <Button
                            pl={40}
                            pr={40}
                            mt={16}
                            leftSection={<Image src={GoogleIcon} mr={4} w={5} />}
                            variant='outline'
                            onClick={() => {
                                restartOauthService();
                            }}
                        >
                            Continue with Google
                        </Button>
                        <Box pt={12} pl={8}>
                            {getOauthIcon()}
                        </Box>
                    </Group>
                </Anchor>
            </Box>
            <Stack p={20}>
                <Flex direction='row' justify='flex-start' align='center'>
                    <Text fz='2xl'>Contacts ({filteredContacts.length})</Text>
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
                                    Here are the contacts on your macOS device that BlueBubbles knows about,
                                    and will serve to any clients that want to know about them. These include
                                    contacts from this Mac's Address Book, as well as contacts from uploads/imports
                                    or manual entry.
                                </Text>
                            </Box>
                        </Popover.Dropdown>
                    </Popover>
                </Flex>
                <Divider orientation='horizontal' />
                <Flex direction='row' justify='flex-end' align='center' pt={12}>
                    <Box w="xxs">
                        <Box style={{ pointerEvents: 'none' }}>
                            <AiOutlineSearch color='gray.300' />
                        </Box>
                        <TextInput
                            placeholder='Search Contacts'
                            onChange={(e: any) => {
                                if (currentPage > 1) {
                                    setCurrentPage(1);
                                }

                                setSearch(e.target.value);
                            }}
                            value={search}
                        />
                    </Box>
                </Flex>
                <Flex justify="center" align="center">
                    {getEmptyContent()}
                </Flex>
                {(contacts.length > 0) ? (
                    <ContactsTable
                        contacts={filterContacts()}
                        onCreate={onCreate}
                        onDelete={onDelete}
                        onUpdate={onUpdate}
                        onAddressAdd={onAddAddress}
                        onAddressDelete={onDeleteAddress}
                    />
                ) : null}
                <Pagination
                    total={pagesCount}
                    value={currentPage}
                    onChange={setCurrentPage}
                    w="full"
                    pt={2}
                />
            </Stack>

            <ContactDialog
                modalRef={dialogRef}
                isOpen={dialogOpen}
                onCreate={onCreate}
                onDelete={onDelete}
                onAddressAdd={onAddAddress}
                onAddressDelete={onDeleteAddress}
                onClose={() => setDialogOpenOff()}
            />

            <ConfirmationDialog
                modalRef={alertRef}
                onClose={() => confirm(null)}
                body={confirmationActions[requiresConfirmation as string]?.message}
                onAccept={() => {
                    confirmationActions[requiresConfirmation as string].func();
                }}
                isOpen={requiresConfirmation !== null}
            />
        </Box>
    );
};