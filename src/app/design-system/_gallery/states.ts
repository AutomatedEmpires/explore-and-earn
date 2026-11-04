// Each component's hover look, so the gallery can show the hover state beside the others: the
// class a component adds on hover, passed to it as className. states.test.tsx fails when a
// component's hover style changes and this map does not.

export const hoverLook = {
  button: {
    primary: 'bg-ink-2',
    secondary: 'bg-surface-2',
    ghost: 'bg-surface-2',
    danger: 'opacity-90',
  },
  iconButton: {
    ghost: 'bg-surface-2',
    outline: 'bg-surface-2',
    subtle: 'bg-line',
    primary: 'bg-ink-2',
    overlay: 'bg-surface-2',
  },
  /** An unselected Pill. */
  pill: 'bg-surface-2',
  /** A Chip that opens a sheet. */
  chip: 'bg-surface-2',
  tab: 'text-ink',
} as const;

export type ButtonVariant = keyof typeof hoverLook.button;
export type IconButtonVariant = keyof typeof hoverLook.iconButton;

export const buttonVariantNames = Object.keys(hoverLook.button) as ButtonVariant[];
export const iconButtonVariantNames = Object.keys(hoverLook.iconButton) as IconButtonVariant[];
