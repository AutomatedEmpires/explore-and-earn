// The gallery's own chrome: a header and the section navigation. It follows the device theme;
// the specimens inside show light and dark side by side.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Wordmark } from '@/ui/components';
import { cn } from '@/ui/cn';
import { galleryHome, sectionPath, sections, topbarOptionsPath } from './routes';

const navItems = [
  { href: galleryHome, label: 'Overview' },
  ...sections.map((s) => ({ href: sectionPath(s.slug), label: s.nav })),
  { href: topbarOptionsPath, label: 'Top bar' },
];

export function GalleryShell({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark href={galleryHome} />
            <span aria-hidden="true" className="h-5 w-px bg-line" />
            <span className="truncate text-15 font-semibold text-ink-2">Design system</span>
          </div>
          <Badge size="sm" tone="neutral" className="hidden sm:inline-flex">
            Internal · not in production
          </Badge>
        </div>
        <nav aria-label="Design system" className="mx-auto max-w-7xl px-1 md:px-5">
          <ul className="flex overflow-x-auto">
            {navItems.map((item) => {
              const here = item.href === current;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={here ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center border-b-2 px-3 text-14 font-semibold no-underline motion-safe:transition-colors',
                      here ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-10 pb-20 md:px-8 md:pt-12">{children}</main>
    </div>
  );
}
