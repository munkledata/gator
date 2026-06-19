import React, { useState, useEffect } from 'react';
import { Box, Text, Flex } from '@mantine/core';
import FilePicker from '../FilePicker';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { showSuccessToast } from '../../utils/ToastUtils';
import { setConfig } from '../../slices/ConfigSlice';


export interface LandingPageFieldProps {
    helpText?: string;
}

export const LandingPageField = (): JSX.Element => {
    const dispatch = useAppDispatch();

    const savedPath: string = useAppSelector(state => state.config.landing_page_path) ?? '';
    const [landingPath, setLandingPath] = useState(savedPath);
    const [landingPathError, setLandingPathError] = useState('');
    const hasError: boolean = (landingPathError ?? '').length > 0;

    useEffect(() => {
        setLandingPath(savedPath);
    }, [savedPath]);

    /**
     * A handler & validator for saving a new landing page path.
     *
     * @param path - The new path to save
     */
    const saveLandingPage = (path: string): void => {
        dispatch(setConfig({ name: 'landing_page_path', value: path }));
        if (hasError) setLandingPathError('');
        showSuccessToast({
            id: 'settings',
            duration: 4000,
            description: 'Successfully saved landing page!'
        });
    };

    return (
        <Box>
            <Text component="label" fw={500} fz="sm" mb={4} htmlFor='socket_port'>Custom Landing Page</Text>
            <Flex direction='row' justify='flex-start' align='center'>
                <FilePicker
                    accept='text/html'
                    placeholder={(landingPath.length === 0) ? 'Click to select an HTML file' : 'Click to select an HTML new file'}
                    multipleFiles={false}
                    clearButtonLabel='Unset'
                    inputProps={{ maxW: '300px' }}
                    hideClearButton={landingPath.length === 0}
                    onClear={() => {
                        if (hasError) setLandingPathError('');
                        dispatch(setConfig({ name: 'landing_page_path', value: '' }));
                        showSuccessToast({
                            id: 'settings',
                            duration: 4000,
                            description: 'Successfully unset landing page!'
                        });
                    }}
                    onFileChange={async (fileList: Array<File>) => {
                        if (hasError) setLandingPathError('');
                        if (fileList.length === 0) {
                            return setLandingPath('');
                        }

                        saveLandingPage(fileList[0].path);
                    }}
                />
            </Flex>
            {!hasError ? (
                <Text fz="xs" c="dimmed">
                    Selected: { landingPath.length === 0 ? 'No custom landing page set' : landingPath }
                </Text>
            ) : (
                <Text fz="xs" c="red">{landingPathError}</Text>
            )}
        </Box>
    );
};
