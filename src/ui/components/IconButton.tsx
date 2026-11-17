import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

const iconButtonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center select-none',
    'motion-safe:transition-colors motion-safe:duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        /** Top bars and toolbars. */
        ghost: 'rounded-md bg-transparent text-ink hover:bg-surface-2',
        /** Card actions (Skip, Save). */
        outline:
          'rounded-full border border-line bg-surface text-ink-2 hover:bg-surface-2 aria-pressed:border-primary aria-pressed:text-ink',
        /** Close buttons in sheets and dialogs. */
        subtle: 'rounded-full bg-surface-2 text-ink hover:bg-line',
        primary: 'rounded-full bg-primary text-on-primary hover:bg-ink-2',
        /** On top of a photo. */
        overlay: 'rounded-full bg-surface text-ink shadow-raised hover:bg-surface-2',
      },
      size: {
        md: 'size-11',
        lg: 'size-12',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

export type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> &
  VariantProps<typeof iconButtonVariants> & {
    /** Required: an icon-only control is named by its aria-label. */
    label: string;
    icon: IconComponent;
    /** A count (shown up to 99+) or a dot. Put the count in `label` too, e.g. "Inbox, 2 unread". */
    badge?: number | boolean;
  };

export function IconButton({
  label,
  icon: Icon,
  badge,
  variant,
  size,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-5.5'} />
      {typeof badge === 'number' && badge > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-primary px-1 text-14 leading-none font-extrabold text-on-primary"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : badge === true ? (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-bg bg-primary"
        />
      ) : null}
    </button>
  );
}
