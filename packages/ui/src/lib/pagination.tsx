/**
 * Drop-in for `/pagination` (now removed) backed by Mantine's `<Pagination>`.
 *
 * @ajna composes a context + many subcomponents (Container/PageGroup/Page/Next/Prev);
 * Mantine renders the whole control in one component. So `<Pagination>` provides the
 * context, `<PaginationContainer>` renders the single Mantine control from it, and the
 * remaining subcomponents render nothing. `usePagination` keeps the same shape.
 */
import React, { createContext, useContext, useState } from 'react';
import { Pagination as MPagination } from '@mantine/core';

interface PaginationState {
    pagesCount: number;
    currentPage: number;
    onPageChange: (page: number) => void;
}

const PaginationCtx = createContext<PaginationState>({ pagesCount: 0, currentPage: 1, onPageChange: () => undefined });

export function usePagination({ pagesCount, initialState }: { pagesCount: number; initialState?: { currentPage?: number } }) {
    const [currentPage, setCurrentPage] = useState(initialState?.currentPage ?? 1);
    const pages = Array.from({ length: Math.max(0, pagesCount) }, (_, i) => i + 1);
    return { currentPage, setCurrentPage, pagesCount, pages, isDisabled: false, pageSize: undefined, setPageSize: () => undefined };
}

export const Pagination = ({ pagesCount, currentPage, onPageChange, children }: any): JSX.Element => (
    <PaginationCtx.Provider value={{ pagesCount, currentPage, onPageChange }}>{children}</PaginationCtx.Provider>
);

export const PaginationContainer = ({ children, ...rest }: any): JSX.Element => {
    void children;
    const { pagesCount, currentPage, onPageChange } = useContext(PaginationCtx);
    return <MPagination total={pagesCount} value={currentPage} onChange={onPageChange} {...rest} />;
};

// @ajna sub-structure is subsumed by the single Mantine control above.
export const PaginationPageGroup : React.FC<any> = () => null;
export const PaginationPage : React.FC<any> = () => null;
export const PaginationPrevious : React.FC<any> = () => null;
export const PaginationNext : React.FC<any> = () => null;
export const PaginationSeparator : React.FC<any> = () => null;
