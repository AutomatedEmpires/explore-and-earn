import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type IconComponent } from '@/ui/icons';

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
        /** Upper-case label, e.g. the SEEKER / HOST role badge (`text-14/bold-caps`, #155). */
        sm: 'h-5 px-2 text-14 leading-none font-bold tracking-wider uppercase',
        md: 'h-7 px-2.5 text-13 font-bold',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

/** The icon a badge shows when it is not given one, so its word never relies on color (#155). */
const toneIcon: Record<BadgeTone, IconComponent> = {
  neutral: Info,
  surface: Info,
  inverse: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** Replaces the tone's icon, e.g. Clock for "Not confirmed" or Sparkles for "Boosted". */
    icon?: IconComponent;
    /**
     * Badges show an icon by default (#155, D3-1): `icon`, or the tone's icon. Turn it off only
     * where something beside the badge already carries the meaning.
     */
    showIcon?: boolean;
  };

export function Badge({
  tone,
  size,
  icon,
  showIcon = true,
  className,
  children,
  ...props
}: BadgeProps) {
  const Icon = showIcon ? (icon ?? toneIcon[tone ?? 'neutral']) : null;
  return (
    <span
      className={cn(badgeVariants({ tone, size }), Icon && size !== 'sm' && 'pl-2', className)}
      {...props}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  );
}
