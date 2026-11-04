import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';
import { LoaderCircle, type IconComponent } from '@/ui/icons';
import { Slot } from './Slot';

// Every focusable element gets the focus-token outline from tokens.css (:focus-visible).
export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap select-none',
    'motion-safe:transition-colors motion-safe:duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-ink-2',
        secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
        ghost: 'bg-transparent text-ink hover:bg-surface-2',
        danger: 'bg-danger text-surface hover:opacity-90',
      },
      size: {
        md: 'h-11 px-5 text-15',
        lg: 'h-12 px-6 text-16',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child (a link, usually) with the button styles instead of a <button>. */
    asChild?: boolean;
    /** Shows a spinner, sets aria-busy and disables the button. */
    loading?: boolean;
    icon?: IconComponent;
  };

export function Button({
  asChild = false,
  loading = false,
  variant,
  size,
  fullWidth,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="size-5 motion-safe:animate-spin" />
      ) : Icon ? (
        <Icon className="size-5" />
      ) : null}
      {children}
    </button>
  );
}
