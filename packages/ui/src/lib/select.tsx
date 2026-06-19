/**
 * Drop-in for `chakra-react-select` (now removed) backed by Mantine.
 *
 * Keeps the react-select-shaped API the screens use — `options`/`value`/`onChange`
 * in `{ value, label }` objects, plus `isMulti` — so the import just repoints here.
 */
import React from 'react';
import { MultiSelect as MMultiSelect, Select as MSelect } from '@mantine/core';

export type Option = { value: string; label: string };
export type Options<T = Option> = T[];

export const Select = ({ isMulti, options, value, onChange, placeholder, isDisabled, ...rest }: any): JSX.Element => {
    const data: Option[] = (options ?? []).map((o: any) => ({ value: String(o.value), label: String(o.label ?? o.value) }));
    const labelOf = (v: string): string => data.find(d => d.value === v)?.label ?? v;

    if (isMulti) {
        const vals = (value ?? []).map((v: any) => String(v?.value ?? v));
        return (
            <MMultiSelect
                data={data}
                value={vals}
                onChange={(vs: string[]) => onChange?.(vs.map(v => ({ value: v, label: labelOf(v) })))}
                placeholder={placeholder}
                disabled={isDisabled}
                searchable
                {...rest}
            />
        );
    }

    const single = value?.value ?? value ?? null;
    return (
        <MSelect
            data={data}
            value={single != null ? String(single) : null}
            onChange={(v: string | null) => onChange?.(v != null ? { value: v, label: labelOf(v) } : null)}
            placeholder={placeholder}
            disabled={isDisabled}
            {...rest}
        />
    );
};
