import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { ShieldCheck, Store, User, type IconComponent } from '@/ui/icons';
import { Badge } from './Badge';

export type WordmarkProps = { href?: string; className?: string };

/** The product name, always written Explore&Earn. */
export function Wordmark({ href = '/', className }: WordmarkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center rounded-sm text-19 font-extrabold tracking-tight text-ink no-underline',
        className,
      )}
    >
      {'Explore&Earn'}
    </Link>
  );
}

export type TopBarRole = 'seeker' | 'host' | 'operator';

const roleLabel: Record<TopBarRole, string> = {
  seeker: 'Seeker',
  host: 'Host',
  operator: 'Operator',
};

const roleIcon: Record<TopBarRole, IconComponent> = {
  seeker: User,
  host: Store,
  operator: ShieldCheck,
};

export type TopBarLink = { href: string; label: string; current?: boolean };

export type TopBarProps = {
  /** Replaces the wordmark. */
  brand?: ReactNode;
  /** A role badge beside the wordmark (one of the top bar options compared in the gallery). */
  role?: TopBarRole;
  /** Before the brand, e.g. a menu button. */
  start?: ReactNode;
  /** Desktop links (hidden below md). */
  links?: readonly TopBarLink[];
  linksLabel?: string;
  /** Right side: icon buttons, the avatar menu, "Sign in". */
  actions?: ReactNode;
  className?: string;
};

export function TopBar({
  brand,
  role,
  start,
  links,
  linksLabel = 'Primary',
  actions,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn('flex h-14 items-center justify-between gap-2 bg-bg pr-2 pl-4', className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        {start}
        {brand ?? <Wordmark />}
        {role ? (
          <Badge size="sm" tone={role === 'seeker' ? 'neutral' : 'inverse'} icon={roleIcon[role]}>
            {roleLabel[role]}
          </Badge>
        ) : null}
        {links && links.length > 0 ? (
          <nav aria-label={linksLabel} className="ml-4 hidden md:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={link.current ? 'page' : undefined}
                    className="inline-flex min-h-11 items-center rounded-md px-3 text-15 font-semibold text-muted no-underline hover:bg-surface-2 hover:text-ink aria-[current=page]:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </header>
  );
}
