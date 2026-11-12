import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

export type SidebarItem = {
  href: string;
  label: string;
  icon: IconComponent;
  current?: boolean;
  /** An unread or pending count, read as part of the link text. */
  count?: number;
  /** Sub-pages (Listings: Active, Drafts, Library), shown while the section is open. */
  children?: readonly { href: string; label: string; current?: boolean }[];
};

export type SidebarProps = {
  items: readonly SidebarItem[];
  label: string;
  /** Above the links, e.g. the OrgSwitcher. */
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

const linkClass =
  'flex min-h-11 items-center gap-3 rounded-md px-3 text-15 font-semibold text-ink-2 no-underline hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink motion-safe:transition-colors';

/** Desktop navigation for the host workspace and the operator console. */
export function Sidebar({ items, label, header, footer, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex w-64 shrink-0 flex-col gap-3 border-r border-line bg-surface p-3',
        className,
      )}
    >
      {header}
      <nav aria-label={label} className="flex-1">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const open = item.current || item.children?.some((c) => c.current);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? 'page' : undefined}
                  className={linkClass}
                >
                  <Icon className="size-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.count ? (
                    <span className="min-w-6 rounded-full bg-primary px-1.5 text-center text-14 leading-5 font-bold text-on-primary tabular-nums">
                      {item.count}
                    </span>
                  ) : null}
                </Link>
                {open && item.children && item.children.length > 0 ? (
                  <ul className="mt-0.5 flex flex-col gap-0.5 pl-8">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          aria-current={child.current ? 'page' : undefined}
                          className={cn(linkClass, 'text-14')}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
      {footer}
    </aside>
  );
}
