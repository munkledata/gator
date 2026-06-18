import { ContactAddress, ContactItem } from 'app/components/tables/ContactsTable';
import { invoke } from 'lib/apiClient';
import { showErrorToast, showSuccessToast } from '../utils/ToastUtils';

export const deleteContact = async (contactId: number): Promise<void> => {
    await invoke('remove-contact', contactId);
    showSuccessToast({
        id: 'contacts',
        description: 'Successfully deleted Contact!'
    });
};

export const deleteContactAddress = async (contacAddresstId: number): Promise<void> => {
    try {
        await invoke('remove-address', contacAddresstId);
        showSuccessToast({
            id: 'contacts',
            description: 'Successfully deleted Address!'
        });
    } catch (ex: any) {
        let msg = ex?.message ?? String(ex);
        msg = msg.split('Error: ')[1];
        showErrorToast({
            id: 'contacts',
            description: `Failed to delete Contact! Error: ${msg}`
        });
    }
};

export const updateContact = async (contactId: number, updatedFields: NodeJS.Dict<any>): Promise<ContactItem> => {
    const result: ContactItem = await invoke('update-contact', { contactId, ...updatedFields });
    showSuccessToast({
        id: 'contacts',
        description: 'Successfully updated Contact!'
    });
    return result;
};

export const createContact = async (
    firstName: string,
    lastName: string,
    { emails = [], phoneNumbers = [] }: { emails?: string[], phoneNumbers?: string[] }
): Promise<ContactItem | null> => {
    try {
        const newContact = await invoke('add-contact', {
            firstName,
            lastName,
            phoneNumbers,
            emails
        });

        showSuccessToast({
            id: 'contacts',
            description: 'Successfully created Contact!'
        });

        return newContact;
    } catch (ex: any) {
        let msg = ex?.message ?? String(ex);
        msg = msg.split('Error: ')[1];
        showErrorToast({
            id: 'contacts',
            description: `Failed to create Contact! Error: ${msg}`
        });
    }

    return null;
};

export const addAddressToContact = async (contactId: number, address: string, addressType: string): Promise<ContactAddress | null> => {
    try {
        const newAddress = await invoke('add-address', {
            contactId,
            address,
            type: addressType
        });

        showSuccessToast({
            id: 'contacts',
            description: 'Successfully added address to Contact!'
        });

        return newAddress;
    } catch (ex: any) {
        let msg = ex?.message ?? String(ex);
        msg = msg.split('Error: ')[1];
        showErrorToast({
            id: 'contacts',
            description: `Failed to add address to Contact! Error: ${msg}`
        });
    }

    return null;
};

export const deleteLocalContacts = async (): Promise<void> => {
    try {
        await invoke('delete-contacts');

        showSuccessToast({
            id: 'contacts',
            description: 'Successfully deleted all local Contacts!'
        });
    } catch (ex: any) {
        let msg = ex?.message ?? String(ex);
        msg = msg.split('Error: ')[1];
        showErrorToast({
            id: 'contacts',
            description: `Failed to delete all local Contacts! Error: ${msg}`
        });
    }
};
