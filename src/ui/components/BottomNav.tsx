import Link from 'next/link';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

export type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  /** The page the user is on; rendered as aria-current="page". */
  current?: boolean;
  /** A dot that says something needs attention (announced, not just shown). */
  attention?: boolean;
};

export type BottomNavProps = {
  items: readonly NavItem[];
  /** The navigation landmark's name, e.g. "Main" or "Host". */
  label: string;
  className?: string;
};

/** Mobile bottom tabs: seeker Seek · Swipe · Map · Profile; host Home · Applicants · ... */
export function BottomNav({ items, label, className }: BottomNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'border-t border-line bg-surface px-1 pt-1.5 pb-[max(1rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <ul className="flex">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                className={cn(
                  'group flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-14 font-semibold text-muted',
                  'aria-[current=page]:font-bold aria-[current=page]:text-ink',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-7.5 w-14 items-center justify-center rounded-full',
                    'group-aria-[current=page]:bg-surface-2 motion-safe:transition-colors',
                  )}
                >
                  <Icon className="size-5.25" />
                  {item.attention ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-0.5 right-3 size-2.5 rounded-full border-2 border-surface bg-danger"
                    />
                  ) : null}
                </span>
                {item.label}
                {item.attention ? <span className="sr-only">, needs attention</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
