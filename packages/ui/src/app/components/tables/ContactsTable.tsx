import React, { useRef, useState } from 'react';
import {
    Table,
    Badge,
    Box,
    Tooltip
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AiOutlineEdit } from 'react-icons/ai';
import { MdOutlineEditOff } from 'react-icons/md';
import { ContactDialog } from '../modals/ContactDialog';
import { ImageFromData } from '../ImageFromData';


export interface ContactAddress {
    address: string;
    id?: number;
};

export interface ContactItem {
    phoneNumbers: ContactAddress[];
    emails: ContactAddress[];
    firstName: string;
    lastName: string;
    displayName: string;
    birthday: string;
    avatar: string;
    id: string;
    sourceType: string;
}


export const ContactsTable = ({
    contacts,
    onCreate,
    onDelete,
    onUpdate,
    onAddressAdd,
    onAddressDelete
}: {
    contacts: Array<ContactItem>,
    onCreate?: (contact: ContactItem) => void,
    onDelete?: (contactId: number | string) => void,
    onUpdate?: (contact: Partial<ContactItem>) => void,
    onAddressAdd?: (contactId: number | string, address: string) => void;
    onAddressDelete?: (contactAddressId: number) => void;
}): JSX.Element => {
    const dialogRef = useRef(null);
    const [dialogOpen, setDialogOpen] = useDisclosure();
    const [selectedContact, setSelectedContact] = useState(null as any | null);

    return (
        <Box>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Edit</Table.Th>
                        <Table.Th>Avatar</Table.Th>
                        <Table.Th>Display Name</Table.Th>
                        <Table.Th>Addresses</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {contacts.map(item => {
                        const name = (item.displayName && item.displayName.length > 0)
                            ? item.displayName
                            : [item?.firstName, item?.lastName].filter((e) => e && e.length > 0).join(' ');
                        const addresses = [
                            ...(item.phoneNumbers ?? []).map(e => e.address),
                            ...(item.emails ?? []).map(e => e.address)
                        ];
                        return (
                            <Table.Tr key={`${item.sourceType}-${item.id}-${name}-${addresses.join('_')}`}>
                                <Table.Td onClick={() => {
                                    if (item?.sourceType === 'api') return;
                                    setSelectedContact(item);
                                    setDialogOpen.open();
                                }}>
                                    {(item?.sourceType === 'api') ? (
                                        <Tooltip label="Not Editable" withArrow aria-label='not editable tooltip'>
                                            <span>
                                                <MdOutlineEditOff />
                                            </span>
                                        </Tooltip>
                                    ): (
                                        <Tooltip label="Click to Edit" withArrow aria-label='editable tooltip'>
                                            <span>
                                                <AiOutlineEdit />
                                            </span>
                                        </Tooltip>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Box ml={12}>
                                        {(item?.avatar && item.avatar.length > 0) ? (
                                            <ImageFromData data={item.avatar} height={24} width={24} style={{ borderRadius: 24 }} />
                                        ) : (
                                            <Badge>N/A</Badge>
                                        )}
                                    </Box>
                                </Table.Td>
                                <Table.Td>{name}</Table.Td>
                                <Table.Td>{addresses.map((addr) => (
                                    <Badge ml={8} key={`${name}-${addr}-${addresses.length}`}>{addr}</Badge>
                                ))}</Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>

            <ContactDialog
                modalRef={dialogRef}
                isOpen={dialogOpen}
                existingContact={selectedContact}
                onDelete={onDelete}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onAddressAdd={onAddressAdd}
                onAddressDelete={onAddressDelete}
                onClose={() => {
                    setSelectedContact(null);
                    setDialogOpen.close();
                }}
            />
        </Box>
    );
};
