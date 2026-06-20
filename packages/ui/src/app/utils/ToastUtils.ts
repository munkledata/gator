import { notifications } from '@mantine/notifications';
import { AnyAction } from '@reduxjs/toolkit';
import { getRandomInt } from './GenericUtils';

export type ToastId = string;

export type ToastStatus = 'info' | 'warning' | 'success' | 'error';

export type ConfirmationItems = {
    [key: string]: {
        message: string,
        shouldDispatch?: boolean,
        func: (args?: NodeJS.Dict<any>) => void | AnyAction | Promise<void>
    }
};

export type ToastParams = {
    id?: ToastId,
    title?: string,
    description: string,
    status?: ToastStatus,
    duration?: number,
    isClosable?: boolean
    onCloseComplete?: () => void
};

const STATUS_COLOR: Record<ToastStatus, string> = {
    info: 'blue',
    warning: 'yellow',
    success: 'green',
    error: 'red'
};

export const showSuccessToast = ({
    id, title = 'Success', description, status = 'success', duration, isClosable, onCloseComplete
}: ToastParams): void => {
    showToast({ id, title, description, status, duration, isClosable, onCloseComplete });
};

export const showErrorToast = ({
    id, title = 'Error', description, status = 'error', duration, isClosable, onCloseComplete
}: ToastParams): void => {
    showToast({ id, title, description, status, duration, isClosable, onCloseComplete });
};

export const showToast = ({
    id = 'global',
    title,
    description,
    status = 'info',
    duration = 3000,
    isClosable = true,
    onCloseComplete
}: ToastParams): void => {
    notifications.show({
        id: `${id}-${String(getRandomInt(10000))}`,
        title,
        message: description,
        color: STATUS_COLOR[status],
        autoClose: duration,
        withCloseButton: isClosable,
        onClose: onCloseComplete
    });
};
