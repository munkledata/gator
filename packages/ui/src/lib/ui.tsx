/* eslint-disable react/display-name, @typescript-eslint/no-unused-vars */
/**
 * Mantine-backed compatibility layer — the project's migration off Chakra UI.
 *
 * Chakra is gone; these are real Mantine components wrapped to accept the Chakra-shaped
 * props the existing screens use (the 4px spacing scale, `gray.100`-style color tokens,
 * `colorScheme`/`isLoading`/`leftIcon`, etc.), so a screen migrates by repointing its
 * import from `lib/ui` to `lib/ui`. Layout/typography/simple-form primitives
 * are covered here; compound widgets (Modal, Menu, Popover, Tabs, Accordion, Table,
 * Slider) are migrated to native Mantine per file. Code can be de-shimmed to idiomatic
 * Mantine incrementally.
 */
import React from 'react';
import {
    Box as MBox,
    Flex as MFlex,
    Stack as MStack,
    Group as MGroup,
    Center as MCenter,
    Grid as MGrid,
    SimpleGrid as MSimpleGrid,
    Divider as MDivider,
    Text as MText,
    Title as MTitle,
    Code as MCode,
    Kbd as MKbd,
    Anchor as MAnchor,
    Button as MButton,
    ActionIcon as MActionIcon,
    Badge as MBadge,
    Loader as MLoader,
    Skeleton as MSkeleton,
    Progress as MProgress,
    Image as MImage,
    Avatar as MAvatar,
    Tooltip as MTooltip,
    MantineProvider
} from '@mantine/core';
import { useDisclosure as mUseDisclosure } from '@mantine/hooks';
import { useMantineColorScheme } from '@mantine/core';

export { MantineProvider };

type AnyProps = Record<string, any>;

const SPACING = new Set(['m', 'mt', 'mb', 'ml', 'mr', 'mx', 'my', 'p', 'pt', 'pb', 'pl', 'pr', 'px', 'py', 'gap', 'rowGap', 'columnGap']);

/** Chakra spacing units are 0.25rem (4px) each; Mantine size props take px numbers. */
const space = (v: any): any => (typeof v === 'number' ? v * 4 : v);

/** Chakra color token `gray.100..900` -> Mantine `gray.0..9`; pass hex/named through. */
function color(v: any): any {
    if (typeof v !== 'string' || !v.includes('.')) return v;
    const [hue, shade] = v.split('.');
    const n = Number(shade);
    // Non-numeric shade (e.g. Chakra "brand.primary") -> bare hue, which Mantine
    // resolves to that color's primary shade. Returning it verbatim crashes Mantine's
    // color parser (.startsWith on an unresolved shade).
    if (!Number.isFinite(n)) return hue;
    const m = n <= 50 ? 0 : Math.min(9, Math.round(n / 100));
    return `${hue}.${m}`;
}

// Chakra exposes CSS as style-props (flexDirection, justifyContent, ...) on every
// component; Mantine's Flex has a few named props but Box/most do not. Routing these to
// an inline `style` object applies them as plain CSS on any Mantine component.
const CSS_PROPS = new Set([
    'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis', 'flex', 'order',
    'justifyContent', 'justifyItems', 'justifySelf', 'alignItems', 'alignContent', 'alignSelf',
    'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'inset',
    'overflow', 'overflowX', 'overflowY', 'cursor', 'transition', 'transform', 'opacity',
    'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow', 'gridAutoFlow', 'gridGap',
    'boxShadow', 'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
    'borderColor', 'borderWidth', 'borderStyle', 'borderBottomWidth', 'borderTopWidth',
    'objectFit', 'whiteSpace', 'textOverflow', 'wordBreak', 'textTransform', 'textDecoration',
    'letterSpacing', 'userSelect', 'pointerEvents', 'float', 'verticalAlign', 'listStyleType', 'aspectRatio'
]);

/** Map a Chakra style-prop bag onto Mantine's equivalents. Unknown props pass through. */
export function adapt(props: AnyProps): AnyProps {
    const out: AnyProps = {};
    const style: AnyProps = {};
    for (const [k, v] of Object.entries(props)) {
        if (v === undefined) continue;
        if (SPACING.has(k)) out[k] = space(v);
        else if (k === 'spacing') out.gap = space(v);
        else if (k === 'bg' || k === 'background' || k === 'backgroundColor') out.bg = color(v);
        else if (k === 'color' || k === 'textColor') out.c = color(v);
        else if (k === 'width') out.w = v;
        else if (k === 'height') out.h = v;
        else if (k === 'minW' || k === 'minWidth') out.miw = v;
        else if (k === 'maxW' || k === 'maxWidth') out.maw = v;
        else if (k === 'minH' || k === 'minHeight') out.mih = v;
        else if (k === 'maxH' || k === 'maxHeight') out.mah = v;
        else if (k === 'fontSize') out.fz = v;
        else if (k === 'fontWeight') out.fw = v;
        else if (k === 'fontStyle') out.fs = v;
        else if (k === 'textAlign') out.ta = v;
        else if (k === 'lineHeight') out.lh = v;
        else if (k === 'rounded' || k === 'borderRadius') style.borderRadius = v;
        else if (k === 'style') Object.assign(style, v);
        else if (CSS_PROPS.has(k)) style[k] = v;
        else if (k.startsWith('_')) continue; // drop Chakra pseudo-props (_hover, _focus, ...)
        else if (k === 'isTruncated' || k === 'noOfLines') out.truncate = v ? 'end' : undefined;
        else out[k] = v;
    }
    if (Object.keys(style).length) out.style = style;
    return out;
}

const fwd = (M: React.ElementType, extra?: (p: AnyProps) => AnyProps) =>
    React.forwardRef<any, AnyProps>((props, ref) => {
        const a = adapt(props);
        return <M ref={ref} {...(extra ? extra(a) : a)} />;
    });

// --- layout primitives ---
export const Box = fwd(MBox);
export const Flex = fwd(MFlex);
// Chakra Stack is vertical by default but goes horizontal with direction="row";
// Mantine Stack is always vertical, so route the horizontal case to Group.
export const Stack = React.forwardRef<any, AnyProps>(({ direction, ...rest }, ref) => {
    const horizontal = direction === 'row' || direction === 'row-reverse';
    const Comp = horizontal ? MGroup : MStack;
    return <Comp ref={ref} {...adapt(rest)} />;
});
export const VStack = fwd(MStack);
export const HStack = fwd(MGroup);
export const Wrap = fwd(MGroup, p => ({ wrap: 'wrap', ...p }));
export const WrapItem = fwd(MBox);
export const Center = fwd(MCenter);
export const SimpleGrid = fwd(MSimpleGrid, p => {
    const { columns, ...rest } = p;
    return columns != null ? { cols: columns, ...rest } : rest;
});
export const Grid = fwd(MGrid);
export const GridItem = fwd(MGrid.Col ?? MBox);
export const Spacer = React.forwardRef<any, AnyProps>((props, ref) => <MBox ref={ref} style={{ flex: 1 }} {...adapt(props)} />);
export const Container = fwd(MBox);

// --- typography ---
export const Text = fwd(MText);
export const Heading = fwd(MTitle, p => {
    const sizeToOrder: Record<string, number> = { xs: 6, sm: 5, md: 4, lg: 3, xl: 2, '2xl': 1 };
    const { size, ...rest } = p;
    return { order: (typeof size === 'string' && sizeToOrder[size]) || 3, ...rest };
});
export const Code = fwd(MCode);
export const Kbd = fwd(MKbd);
export const Link = fwd(MAnchor);

// --- feedback ---
export const Divider = fwd(MDivider);
export const Badge = fwd(MBadge, p => (p.colorScheme ? { color: p.colorScheme, ...p } : p));
export const Tag = fwd(MBadge, p => ({ variant: 'light', ...p }));
export const Spinner = fwd(MLoader, p => ({ size: p.size ?? 'sm', ...p }));
export const Skeleton = fwd(MSkeleton);
export const Progress = fwd(MProgress, p => (p.value != null ? p : { value: 0, ...p }));

// --- media ---
export const Image = fwd(MImage);
export const Avatar = fwd(MAvatar);

// --- form / actions ---
export const Button = fwd(MButton, p => {
    const { colorScheme, isLoading, isDisabled, leftIcon, rightIcon, ...rest } = p;
    return {
        ...(colorScheme ? { color: colorScheme } : {}),
        ...(isLoading != null ? { loading: isLoading } : {}),
        ...(isDisabled != null ? { disabled: isDisabled } : {}),
        ...(leftIcon ? { leftSection: leftIcon } : {}),
        ...(rightIcon ? { rightSection: rightIcon } : {}),
        ...rest
    };
});
export const IconButton = React.forwardRef<any, AnyProps>((props, ref) => {
    const { icon, colorScheme, isLoading, isDisabled, isRound, 'aria-label': ariaLabel, ...rest } = props;
    return (
        <MActionIcon
            ref={ref}
            aria-label={ariaLabel}
            variant={rest.variant ?? 'subtle'}
            {...(colorScheme ? { color: colorScheme } : {})}
            {...(isLoading != null ? { loading: isLoading } : {})}
            {...(isDisabled != null ? { disabled: isDisabled } : {})}
            {...adapt(rest)}
        >
            {icon ?? props.children}
        </MActionIcon>
    );
});
export const Tooltip = React.forwardRef<any, AnyProps>((props, ref) => {
    const { label, children, ...rest } = props;
    return (
        <MTooltip ref={ref} label={label} withArrow {...rest}>
            {children}
        </MTooltip>
    );
});

// --- hooks ---
export function useColorMode(): { colorMode: 'light' | 'dark'; toggleColorMode: () => void; setColorMode: (v: any) => void } {
    const { colorScheme, toggleColorScheme, setColorScheme } = useMantineColorScheme();
    return {
        colorMode: (colorScheme === 'auto' ? 'light' : colorScheme) as 'light' | 'dark',
        toggleColorMode: toggleColorScheme,
        setColorMode: setColorScheme
    };
}

export function useColorModeValue<L, D>(light: L, dark: D): L | D {
    const { colorScheme } = useMantineColorScheme();
    return colorScheme === 'dark' ? dark : light;
}

/** Chakra's useBoolean -> [value, { on, off, toggle }]. */
export function useBoolean(initial = false): [boolean, { on: () => void; off: () => void; toggle: () => void }] {
    const [value, handlers] = mUseDisclosure(initial);
    return [value, { on: handlers.open, off: handlers.close, toggle: handlers.toggle }];
}

/** Chakra's useDisclosure -> { isOpen, onOpen, onClose, onToggle }. */
export function useDisclosure(initial = false): { isOpen: boolean; onOpen: () => void; onClose: () => void; onToggle: () => void } {
    const [isOpen, handlers] = mUseDisclosure(initial);
    return { isOpen, onOpen: handlers.open, onClose: handlers.close, onToggle: handlers.toggle };
}

// =====================================================================================
// Form controls
// =====================================================================================
import {
    TextInput as MTextInput,
    Textarea as MTextarea,
    Checkbox as MCheckbox,
    Switch as MSwitch,
    NativeSelect as MNativeSelect,
    Alert as MAlert,
    Modal as MModal,
    Drawer as MDrawer,
    Menu as MMenu,
    Popover as MPopover,
    Tabs as MTabs,
    Accordion as MAccordion,
    Table as MTable,
    Slider as MSlider,
    Collapse as MCollapse,
    List as MList,
    Loader as MLoader2
} from '@mantine/core';

const pickInput = (p: AnyProps): AnyProps => {
    const { isDisabled, isInvalid, isRequired, isReadOnly, ...rest } = p;
    return {
        ...(isDisabled != null ? { disabled: isDisabled } : {}),
        ...(isInvalid ? { error: true } : {}),
        ...(isRequired != null ? { required: isRequired } : {}),
        ...(isReadOnly != null ? { readOnly: isReadOnly } : {}),
        ...rest
    };
};

export const Input = React.forwardRef<any, AnyProps>((props, ref) => <MTextInput ref={ref} {...adapt(pickInput(props))} />);
export const Textarea = React.forwardRef<any, AnyProps>((props, ref) => <MTextarea ref={ref} {...adapt(pickInput(props))} />);
// Chakra InputGroup/addon elements have no Mantine analogue; render children inline.
export const InputGroup = fwd(MBox);
export const InputLeftElement = fwd(MBox);
export const InputRightElement = fwd(MBox);
export const InputLeftAddon = fwd(MBox);
export const InputRightAddon = fwd(MBox);

export const Checkbox = React.forwardRef<any, AnyProps>((props, ref) => {
    const { isChecked, isDisabled, children, ...rest } = props;
    return <MCheckbox ref={ref} label={children} {...(isChecked != null ? { checked: isChecked } : {})} {...(isDisabled != null ? { disabled: isDisabled } : {})} {...rest} />;
});
export const Switch = React.forwardRef<any, AnyProps>((props, ref) => {
    const { isChecked, isDisabled, children, ...rest } = props;
    return <MSwitch ref={ref} label={children} {...(isChecked != null ? { checked: isChecked } : {})} {...(isDisabled != null ? { disabled: isDisabled } : {})} {...rest} />;
});
export const Select = React.forwardRef<any, AnyProps>((props, ref) => <MNativeSelect ref={ref} {...adapt(pickInput(props))} />);

// Chakra FormControl groups label+field+error; Mantine attaches those to the field.
// Keep it as a layout wrapper so existing markup still renders.
export const FormControl = fwd(MBox);
export const FormLabel = React.forwardRef<any, AnyProps>((props, ref) => <MText ref={ref} fw={500} fz="sm" mb={4} {...adapt(props)} component="label" />);
export const FormHelperText = React.forwardRef<any, AnyProps>((props, ref) => <MText ref={ref} fz="xs" c="dimmed" {...adapt(props)} />);
export const FormErrorMessage = React.forwardRef<any, AnyProps>((props, ref) => <MText ref={ref} fz="xs" c="red" {...adapt(props)} />);

// =====================================================================================
// Alert  (Chakra: <Alert status><AlertIcon/><AlertTitle/><AlertDescription/></Alert>)
// =====================================================================================
const STATUS_COLOR: Record<string, string> = { info: 'blue', success: 'green', warning: 'yellow', error: 'red' };
export const Alert = React.forwardRef<any, AnyProps>((props, ref) => {
    const { status, children, ...rest } = props;
    return <MAlert ref={ref} color={STATUS_COLOR[status as string] ?? 'blue'} variant="light" {...adapt(rest)}>{children}</MAlert>;
});
export const AlertIcon : React.FC<any> = () => null;
export const AlertTitle = fwd(MText, p => ({ fw: 600, ...p }));
export const AlertDescription = fwd(MText);

// =====================================================================================
// Modal / Drawer  — lift the <ModalHeader>/<DrawerHeader> into Mantine's title bar
// (which brings the close button); body + footer render below.
// =====================================================================================
export const ModalOverlay: React.FC<any> = () => null;
export const ModalContent = ({ children }: AnyProps) => <>{children}</>;
export const ModalHeader = fwd(MText, p => ({ fw: 600, fz: 'lg', ...p }));
export const ModalBody = fwd(MBox);
export const ModalFooter = fwd(MGroup, p => ({ justify: 'flex-end', mt: 'md', ...p }));
export const ModalCloseButton: React.FC<any> = () => null;
export const DrawerOverlay: React.FC<any> = () => null;
export const DrawerContent = ({ children }: AnyProps) => <>{children}</>;
export const DrawerHeader = fwd(MText, p => ({ fw: 600, fz: 'lg', ...p }));
export const DrawerBody = fwd(MBox);
export const DrawerFooter = fwd(MGroup, p => ({ justify: 'flex-end', mt: 'md', ...p }));
export const DrawerCloseButton: React.FC<any> = () => null;

function splitHeader(children: React.ReactNode, HeaderType: React.ElementType): { title: React.ReactNode; body: React.ReactNode } {
    let title: React.ReactNode = null;
    const walk = (nodes: React.ReactNode): React.ReactNode =>
        React.Children.map(nodes, node => {
            if (!React.isValidElement(node)) return node;
            if (node.type === HeaderType) {
                title = (node.props as AnyProps).children;
                return null;
            }
            if (node.type === ModalContent || node.type === DrawerContent) {
                return walk((node.props as AnyProps).children);
            }
            return node;
        });
    const body = walk(children);
    return { title, body };
}

export const Modal = ({ isOpen, onClose, children, size, isCentered, ...rest }: AnyProps) => {
    const { title, body } = splitHeader(children, ModalHeader);
    return <MModal opened={!!isOpen} onClose={onClose} size={size} centered={isCentered} title={title} {...(rest as any)}>{body}</MModal>;
};

export const Drawer = ({ isOpen, onClose, children, placement, size, ...rest }: AnyProps) => {
    const { title, body } = splitHeader(children, DrawerHeader);
    return <MDrawer opened={!!isOpen} onClose={onClose} position={placement} size={size} title={title} {...(rest as any)}>{body}</MDrawer>;
};

// =====================================================================================
// Menu  (Chakra MenuButton/MenuList/MenuItem -> Mantine Menu.Target/Dropdown/Item)
// =====================================================================================
export const Menu = ({ children, ...rest }: AnyProps) => <MMenu {...rest}>{children}</MMenu>;
// Mantine's Menu.Target needs ONE ref-able child; Chakra's MenuButton is the trigger
// button itself (often with string children). Wrap it in a real Button.
export const MenuButton = ({ children, as, icon, leftIcon, rightIcon, ...rest }: AnyProps) => (
    <MMenu.Target>
        <MButton variant="default" leftSection={leftIcon} rightSection={rightIcon} {...adapt(rest)}>{children ?? icon}</MButton>
    </MMenu.Target>
);
export const MenuList = ({ children, ...rest }: AnyProps) => <MMenu.Dropdown {...rest}>{children}</MMenu.Dropdown>;
export const MenuItem = ({ children, icon, ...rest }: AnyProps) => <MMenu.Item leftSection={icon} {...rest}>{children}</MMenu.Item>;
export const MenuDivider = () => <MMenu.Divider />;
export const MenuGroup = ({ children, title }: AnyProps) => <MMenu.Label>{title}{children}</MMenu.Label>;

// =====================================================================================
// Popover  (Chakra PopoverTrigger/Content/Body -> Mantine Popover.Target/Dropdown)
// =====================================================================================
export const Popover = ({ children, isOpen, onClose, ...rest }: AnyProps) => <MPopover opened={isOpen} onClose={onClose} withArrow {...rest}>{children}</MPopover>;
export const PopoverTrigger = ({ children }: AnyProps) => <MPopover.Target>{children}</MPopover.Target>;
export const PopoverContent = ({ children, ...rest }: AnyProps) => <MPopover.Dropdown {...adapt(rest)}>{children}</MPopover.Dropdown>;
export const PopoverBody = fwd(MBox);
export const PopoverHeader = fwd(MText, p => ({ fw: 600, mb: 'xs', ...p }));
export const PopoverFooter = fwd(MBox);
export const PopoverArrow : React.FC<any> = () => null;
export const PopoverCloseButton : React.FC<any> = () => null;

// =====================================================================================
// Tabs  (Chakra is index-based; Mantine is value-based). Assign values by child
// position via cloneElement — robust to re-renders and conditional tabs.
// =====================================================================================
const injectValues = (nodes: React.ReactNode): React.ReactNode => {
    let i = 0;
    return React.Children.map(nodes, node =>
        React.isValidElement(node) ? React.cloneElement(node as any, { __value: String(i++) }) : node
    );
};
export const Tabs = ({ children, index, onChange, defaultIndex, ...rest }: AnyProps) => {
    const processed = React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        if (child.type === TabList) return React.cloneElement(child as any, {}, injectValues((child.props as AnyProps).children));
        if (child.type === TabPanels) return <>{injectValues((child.props as AnyProps).children)}</>;
        return child;
    });
    return (
        <MTabs
            defaultValue={String(defaultIndex ?? 0)}
            {...(index != null ? { value: String(index) } : {})}
            onChange={(v: any) => onChange?.(Number(v))}
            {...rest}
        >{processed}</MTabs>
    );
};
export const TabList = ({ children, ...rest }: AnyProps) => <MTabs.List {...rest}>{children}</MTabs.List>;
export const Tab = ({ children, __value, ...rest }: AnyProps) => <MTabs.Tab value={__value ?? '0'} {...rest}>{children}</MTabs.Tab>;
export const TabPanels = ({ children }: AnyProps) => <>{children}</>;
export const TabPanel = ({ children, __value, ...rest }: AnyProps) => <MTabs.Panel value={__value ?? '0'} {...adapt(rest)}>{children}</MTabs.Panel>;

// =====================================================================================
// Accordion
// =====================================================================================
export const Accordion = ({ children, allowToggle, allowMultiple, ...rest }: AnyProps) => {
    const processed = React.Children.map(children, (child, i) =>
        React.isValidElement(child) ? React.cloneElement(child as any, { __value: String(i) }) : child
    );
    return <MAccordion multiple={!!allowMultiple} {...rest}>{processed}</MAccordion>;
};
export const AccordionItem = ({ children, __value, ...rest }: AnyProps) => <MAccordion.Item value={__value ?? '0'} {...rest}>{children}</MAccordion.Item>;
export const AccordionButton = ({ children, ...rest }: AnyProps) => <MAccordion.Control {...rest}>{children}</MAccordion.Control>;
export const AccordionPanel = ({ children, ...rest }: AnyProps) => <MAccordion.Panel {...adapt(rest)}>{children}</MAccordion.Panel>;
export const AccordionIcon : React.FC<any> = () => null;

// =====================================================================================
// Table
// =====================================================================================
export const Table = fwd(MTable);
export const TableContainer = fwd(MBox, p => ({ style: { overflowX: 'auto' }, ...p }));
export const Thead = ({ children, ...rest }: AnyProps) => <MTable.Thead {...rest}>{children}</MTable.Thead>;
export const Tbody = ({ children, ...rest }: AnyProps) => <MTable.Tbody {...rest}>{children}</MTable.Tbody>;
export const Tfoot = ({ children, ...rest }: AnyProps) => <MTable.Tfoot {...rest}>{children}</MTable.Tfoot>;
export const Tr = ({ children, ...rest }: AnyProps) => <MTable.Tr {...rest}>{children}</MTable.Tr>;
export const Th = ({ children, isNumeric, ...rest }: AnyProps) => <MTable.Th {...adapt(rest)}>{children}</MTable.Th>;
export const Td = ({ children, isNumeric, ...rest }: AnyProps) => <MTable.Td {...adapt(rest)}>{children}</MTable.Td>;

// =====================================================================================
// Slider  (Chakra subcomponents collapse into the single Mantine Slider)
// =====================================================================================
export const Slider = React.forwardRef<any, AnyProps>((props, ref) => {
    const { onChange, onChangeEnd, value, defaultValue, min, max, step, ...rest } = props;
    return <MSlider ref={ref} value={value} defaultValue={defaultValue} min={min} max={max} step={step} onChange={onChange} onChangeEnd={onChangeEnd} {...adapt(rest)} />;
});
export const SliderTrack : React.FC<any> = () => null;
export const SliderFilledTrack : React.FC<any> = () => null;
export const SliderThumb : React.FC<any> = () => null;
export const SliderMark : React.FC<any> = () => null;

// =====================================================================================
// Misc
// =====================================================================================
export const Collapse = ({ in: inProp, children, ...rest }: AnyProps) => <MCollapse in={!!inProp} {...rest}>{children}</MCollapse>;
export const UnorderedList = fwd(MList);
export const OrderedList = fwd(MList, p => ({ type: 'ordered', ...p }));
export const ListItem = ({ children, ...rest }: AnyProps) => <MList.Item {...rest}>{children}</MList.Item>;
export const CircularProgress = fwd(MLoader2);
// Chakra <Icon as={SomeIcon}/> -> render the icon component directly.
export const Icon = ({ as: As, ...rest }: AnyProps) => (As ? <As {...rest} /> : null);

// Chakra re-exported emotion's keyframes for CSS animations.
export { keyframes } from '@emotion/react';

// =====================================================================================
// Additional Chakra surface
// =====================================================================================
import { Radio as MRadio, CloseButton as MCloseButton, Table as MTable2 } from '@mantine/core';

// AlertDialog -> Modal family (drop Chakra's leastDestructiveRef).
export const AlertDialog = ({ isOpen, onClose, leastDestructiveRef, children, isCentered, size, ...rest }: AnyProps) =>
    <MModal opened={!!isOpen} onClose={onClose} centered={isCentered} size={size} withCloseButton={false} {...(rest as any)}>{children}</MModal>;
export const AlertDialogOverlay = ({ children }: AnyProps) => <>{children}</>;
export const AlertDialogContent = ({ children }: AnyProps) => <>{children}</>;
export const AlertDialogHeader = ModalHeader;
export const AlertDialogBody = ModalBody;
export const AlertDialogFooter = ModalFooter;
export const AlertDialogCloseButton = ModalCloseButton;

// Transitions -> render children when `in` (no animation; visual-only).
export const SlideFade = ({ in: inProp, children, ...rest }: AnyProps) => (inProp === false ? null : <MBox {...adapt(rest)}>{children}</MBox>);
export const ScaleFade = SlideFade;
export const Fade = SlideFade;

export const TableCaption = ({ children, ...rest }: AnyProps) => <MTable2.Caption {...(rest as any)}>{children}</MTable2.Caption>;
export const LinkBox = fwd(MBox);
export const LinkOverlay = fwd(MAnchor);
export const TagLabel = fwd(MText, p => ({ span: true, ...p }));
export const TagCloseButton = (props: AnyProps) => <MCloseButton size="xs" {...(adapt(props) as any)} />;
export const TagLeftIcon = ({ as: As, ...rest }: AnyProps) => (As ? <As {...rest} /> : null);
export const TagRightIcon = TagLeftIcon;
export const CloseButton = (props: AnyProps) => <MCloseButton {...(adapt(props) as any)} />;
export const Radio = ({ children, ...rest }: AnyProps) => <MRadio label={children} {...(rest as any)} />;
export const RadioGroup = ({ children, onChange, value, defaultValue, ...rest }: AnyProps) =>
    <MRadio.Group value={value} defaultValue={defaultValue} onChange={onChange} {...(rest as any)}>{children}</MRadio.Group>;
export const VisuallyHidden = fwd(MBox, p => ({ style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }, ...p }));
export const Portal = ({ children }: AnyProps) => <>{children}</>;

// Loose prop-type aliases (Chakra components exported their *Props types).
export type BoxProps = AnyProps;
export type FlexProps = AnyProps;
export type StackProps = AnyProps;
export type ButtonProps = AnyProps;
export type TextProps = AnyProps;
export type InputProps = AnyProps;
export type ModalProps = AnyProps;

export const SkeletonText = ({ noOfLines, ...rest }: AnyProps) => <MSkeleton height={8} radius="sm" {...(adapt(rest) as any)} />;
