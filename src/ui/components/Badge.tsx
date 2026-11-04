import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-ink-2',
        /** On photos (card covers). */
        surface: 'bg-surface text-ink',
        inverse: 'bg-primary text-on-primary',
        success: 'bg-success-bg text-success',
        warning: 'bg-warning-bg text-warning',
        danger: 'bg-danger-bg text-danger',
      },
      size: {
        /** Upper-case label, e.g. the SEEKER / HOST role badge. */
        sm: 'h-5 px-2 text-12 leading-none font-bold tracking-wider uppercase',
        md: 'h-7 px-2.5 text-13 font-bold',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** Status badges (warning, danger) should carry an icon so they never rely on color alone. */
    icon?: IconComponent;
  };

export function Badge({ tone, size, icon: Icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ tone, size }), Icon && size !== 'sm' && 'pl-2', className)}
      {...props}
    >
      {Icon ? <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} /> : null}
      {children}
    </span>
  );
}
