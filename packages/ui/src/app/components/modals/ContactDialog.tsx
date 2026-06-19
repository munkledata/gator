import React, { useEffect, useState } from 'react';
import {
    Button,
    Box,
    TextInput,
    Text,
    Flex,
    Badge,
    CloseButton,
    Group,
    ActionIcon,
    Modal
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
type FocusableElement = HTMLElement;
import { ContactAddress, ContactItem } from '../tables/ContactsTable';
import { showErrorToast } from 'app/utils/ToastUtils';
import { AiOutlinePlus } from 'react-icons/ai';
import { ImageFromData } from '../ImageFromData';


interface ContactDialogProps {
    onCancel?: () => void;
    onDelete?: (contactId: number | string) => void;
    onCreate?: (contact: ContactItem) => void;
    onUpdate?: (contact: Partial<ContactItem>) => void;
    onAddressAdd?: (contactId: number | string, address: string) => void;
    onAddressDelete?: (contactAddressId: number) => void;
    onClose: () => void;
    isOpen: boolean;
    modalRef: React.RefObject<FocusableElement>;
    existingContact?: ContactItem;
}

export const ContactDialog = ({
    onCancel,
    onDelete,
    onCreate,
    onUpdate,
    onClose,
    onAddressAdd,
    onAddressDelete,
    isOpen,
    modalRef,
    existingContact,
}: ContactDialogProps): JSX.Element => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [currentAddress, setCurrentAddress] = useState('');
    const [hasEdited, setHasEdited] = useDisclosure(false);
    const [phones, setPhones] = useState([] as ContactAddress[]);
    const [emails, setEmails] = useState([] as ContactAddress[]);
    const [firstNameError, setFirstNameError] = useState('');
    const isNameValid = (firstNameError ?? '').length > 0;

    useEffect(() => {
        if (!existingContact) return;
        if (existingContact.firstName) setFirstName(existingContact.firstName);
        if (existingContact.lastName) setLastName(existingContact.lastName);
        if (existingContact.displayName) setDisplayName(existingContact.displayName);
        if (existingContact.phoneNumbers) setPhones(existingContact.phoneNumbers);
        if (existingContact.emails) setEmails(existingContact.emails);
    }, [existingContact]);

    const addAddress = (address: string) => {
        const existsPhone = phones.map((e: ContactAddress) => e.address).includes(address);
        const existsEmail = emails.map((e: ContactAddress) => e.address).includes(address);
        if (existsPhone || existsEmail) {
            return showErrorToast({
                id: 'contacts',
                description: 'Address already exists!'
            });
        }

        if (address.includes('@')) {
            setEmails([{ address }, ...emails]);
        } else {
            setPhones([{ address }, ...phones]);
        }

        if (onAddressAdd && existingContact) {
            onAddressAdd(existingContact.id, address);
        }
    };

    const removeAddress = (address: string, addressId: number | null) => {
        if (address.includes('@')) {
            setEmails(emails.filter((e: NodeJS.Dict<any>) => e.address !== address));
        } else {
            setPhones(phones.filter((e: NodeJS.Dict<any>) => e.address !== address));
        }

        if (onAddressDelete && addressId) {
            onAddressDelete(addressId);
        }
    };

    const _onClose = () => {
        setPhones([]);
        setEmails([]);
        setFirstName('');
        setLastName('');
        setDisplayName('');
        setCurrentAddress('');
        setHasEdited.close();

        if (onClose) onClose();
    };

    const firstLastField = () => {
        return (
            <>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='firstName'>First Name</Text>
                    <TextInput
                        id='firstName'
                        type='text'
                        value={firstName}
                        placeholder='Tim'
                        onChange={(e: any) => {
                            setFirstNameError('');
                            setFirstName(e.target.value);
                            if (!hasEdited) {
                                setDisplayName(`${e.target.value} ${lastName}`.trim());
                            }
                        }}
                    />
                    {isNameValid ? (
                        <Text fz="xs" c="red">{firstNameError}</Text>
                    ) : null}
                </Box>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='lastName'>Last Name</Text>
                    <TextInput
                        id='lastName'
                        type='text'
                        value={lastName}
                        placeholder='Apple'
                        onChange={(e: any) => {
                            setLastName(e.target.value);
                            if (!hasEdited) {
                                setDisplayName(`${firstName} ${e.target.value}`.trim());
                            }
                        }}
                    />
                </Box>
            </>
        );
    };

    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose()}
            withCloseButton={false}
        >
            <Text fw={600} fz="lg">
                {(existingContact) ? 'Edit Contact' : 'Add a new Contact'}
            </Text>

            <Box>
                <Text>Add a custom contact to the server's database</Text>
                {(existingContact?.avatar && existingContact.avatar.length > 0) ? (
                    <Group justify="space-between" align="center">
                        <Box mt={20}>
                            <ImageFromData data={existingContact.avatar} height={150} width={150} style={{ borderRadius: 150 }} />
                        </Box>
                        <Box>
                            {firstLastField()}
                        </Box>
                    </Group>
                ) : (
                    <Box>
                        {firstLastField()}
                    </Box>
                )}
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='lastName'>Display Name</Text>
                    <TextInput
                        id='displayName'
                        type='text'
                        value={displayName}
                        placeholder='Tim Apple'
                        onChange={(e: any) => {
                            setHasEdited.open();
                            setDisplayName(e.target.value);
                        }}
                    />
                </Box>
                <Box mt={20}>
                    <Text component="label" fw={500} fz="sm" mb={4} htmlFor='address'>Addresses</Text>
                    <Group>
                        <TextInput
                            id='address'
                            type='text'
                            value={currentAddress}
                            placeholder='Add Address'
                            onChange={(e: any) => {
                                setCurrentAddress(e.target.value);
                            }}
                        />
                        <ActionIcon
                            variant="subtle"
                            onClick={() => {
                                if (!currentAddress || currentAddress.length === 0) return;
                                addAddress(currentAddress);
                                setCurrentAddress('');
                            }}
                            aria-label='Add'
                        >
                            <AiOutlinePlus />
                        </ActionIcon>
                    </Group>
                    <Flex direction="row" align="center" justify="flex-start" wrap="wrap" mt={8}>
                        {[...phones, ...emails].map(((e: ContactAddress) => {
                            return (
                                <Badge
                                    mt={4}
                                    mx={4}
                                    size={'md'}
                                    key={e.address}
                                    variant='solid'
                                    style={{ borderRadius: 'full' }}
                                >
                                    <Text span>{e.address}</Text>
                                    <CloseButton
                                        size="xs"
                                        onClick={() => {
                                            removeAddress(e.address, (e.id) ? e.id : null);
                                        }}
                                    />
                                </Badge>
                            );
                        }))}
                    </Flex>
                </Box>
            </Box>

            <Group justify="flex-end" mt="md">
                <Button
                    ref={modalRef as React.Ref<HTMLButtonElement>}
                    onClick={() => {
                        if (!existingContact && onCancel) onCancel();
                        if (existingContact && onUpdate) {
                            existingContact.firstName = firstName;
                            existingContact.lastName = lastName;
                            existingContact.displayName = displayName;
                            onUpdate(existingContact);
                        }
                        _onClose();
                    }}
                >
                    {(existingContact) ? 'Save & Close' : 'Cancel'}
                </Button>
                {(existingContact) ? (
                    <Button
                        ml={12}
                        bg='red'
                        ref={modalRef as React.Ref<HTMLButtonElement>}
                        onClick={() => {
                            if (onDelete) {
                                onDelete(Number.parseInt(existingContact.id));
                            }

                            _onClose();
                        }}
                    >
                        Delete
                    </Button>
                ) : null}
                {(!existingContact) ? (
                    <Button
                        ml={12}
                        bg='brand'
                        ref={modalRef as React.Ref<HTMLButtonElement>}
                        onClick={() => {
                            if (firstName.length === 0) {
                                setFirstNameError('Please enter a first name for the contact!');
                                return;
                            }

                            if (onCreate) {
                                onCreate({
                                    firstName,
                                    lastName,
                                    phoneNumbers: phones,
                                    emails: emails,
                                    displayName,
                                    birthday: '',
                                    avatar: '',
                                    id: '',
                                    sourceType: 'db'
                                });
                            }

                            _onClose();
                        }}
                    >
                        Create
                    </Button>
                ) : null}
            </Group>
        </Modal>
    );
};
