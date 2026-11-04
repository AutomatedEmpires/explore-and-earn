import type { ComponentProps, ReactNode } from 'react';
import { categoryMeta, type Category } from '@/ui/categories';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

export type PillProps = Omit<ComponentProps<'button'>, 'children'> & {
  children: ReactNode;
  /** Toggle state, exposed as aria-pressed. Leave undefined for a plain action pill. */
  selected?: boolean;
  icon?: IconComponent;
  /** Shows the category icon in its color, e.g. the Maritime filter. */
  category?: Category;
  count?: number;
};

/** A filter pill (Seek's category filters, the applicant pipeline stages). */
export function Pill({
  children,
  selected,
  icon,
  category,
  count,
  className,
  type = 'button',
  ...props
}: PillProps) {
  const meta = category ? categoryMeta[category] : undefined;
  const Icon = icon ?? meta?.icon;
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        // 36 px to look at, 44 px to touch: the ::before extends the hit area 4 px up and down.
        'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-14 font-semibold whitespace-nowrap',
        'before:absolute before:inset-x-0 before:-inset-y-1',
        'motion-safe:transition-colors motion-safe:duration-150',
        selected
          ? 'bg-primary text-on-primary'
          : 'border border-line bg-surface text-ink hover:bg-surface-2',
        Icon && 'pl-2.5',
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon className={cn('size-4', !selected && meta ? meta.solidText : undefined)} />
      ) : null}
      {children}
      {count !== undefined ? (
        <span className={cn('tabular-nums', selected ? 'text-on-primary' : 'text-muted')}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
