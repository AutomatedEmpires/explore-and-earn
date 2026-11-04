import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

export type IconLinkProps = Omit<ComponentProps<typeof Link>, 'aria-label' | 'children'> & {
  /** Required: an icon-only link is named by its aria-label. */
  label: string;
  icon: IconComponent;
  /** A count (shown up to 99+). Put the count in `label` too, e.g. "Inbox, 2 unread". */
  badge?: number;
  /** The page the user is on; rendered as aria-current="page". */
  current?: boolean;
};

/**
 * An icon-only navigation link (top bar Community, Inbox, Notifications): IconButton's ghost
 * look, 44x44, but a real <a> because it goes somewhere.
 */
export function IconLink({
  label,
  icon: Icon,
  badge,
  current,
  className,
  ...props
}: IconLinkProps) {
  return (
    <Link
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink select-none',
        'hover:bg-surface-2 aria-[current=page]:bg-surface-2 motion-safe:transition-colors motion-safe:duration-150',
        className,
      )}
      {...props}
    >
      <Icon className="size-5.5" />
      {typeof badge === 'number' && badge > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-primary px-1 text-12 leading-none font-extrabold text-on-primary"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}
