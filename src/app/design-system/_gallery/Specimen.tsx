// Layout pieces of the gallery: a section, a specimen shown in light and dark side by side, and
// a row of labelled states. Token classes only, like every screen.
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { themes, type Theme } from '@/ui/tokens';

export function PageIntro({
  title,
  children,
  aside,
}: {
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-32 font-extrabold text-ink">{title}</h1>
        {children ? <div className="text-17 text-ink-2">{children}</div> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-8 pt-12">
      <div className="flex max-w-3xl flex-col gap-2">
        <h2 id={`${id}-title`} className="text-24 font-extrabold text-ink">
          {title}
        </h2>
        {description ? <div className="text-15 text-ink-2">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * One specimen, rendered once per theme in its own data-theme frame. `children` is called with
 * the theme so ids and radio-group names stay unique across the two copies.
 */
export function Specimen({
  title,
  note,
  stack = false,
  children,
}: {
  title: string;
  note?: ReactNode;
  /** Light above dark instead of side by side, for wide components. */
  stack?: boolean;
  children: (theme: Theme) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-17 font-bold text-ink">{title}</h3>
        {note ? <p className="text-14 text-muted">{note}</p> : null}
      </div>
      <div className={cn('grid gap-4', !stack && 'lg:grid-cols-2')}>
        {themes.map((theme) => (
          <div
            key={theme}
            data-theme={theme}
            className="flex min-w-0 flex-col gap-4 rounded-xl border border-line p-4 md:p-6"
          >
            <p className="text-12 leading-none font-bold tracking-wider text-muted uppercase">
              {theme === 'light' ? 'Light' : 'Dark'}
            </p>
            {children(theme)}
          </div>
        ))}
      </div>
    </div>
  );
}

export type StateItem = { label: string; node: ReactNode; wide?: boolean };

/** A row of one component's states, each captioned (Default, Hover, Focus, Disabled, ...). */
export function States({ items, className }: { items: readonly StateItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-start gap-x-6 gap-y-5', className)}>
      {items.map((item) => (
        <li
          key={item.label}
          className={cn('flex min-w-0 flex-col items-start gap-2', item.wide && 'w-full')}
        >
          <span className="text-12 font-semibold text-muted">{item.label}</span>
          {item.node}
        </li>
      ))}
    </ul>
  );
}

/**
 * Shows a keyboard focus ring without focusing anything (see gallery.css). `focus` rings every
 * control inside, so wrap one; `focus-current` rings only a composite's current item.
 */
export function ForceFocus({
  current = false,
  children,
}: {
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <div data-force-state={current ? 'focus-current' : 'focus'} className="contents">
      {children}
    </div>
  );
}

/** A label/value pair for token and spec tables. */
export function Meta({ children }: { children: ReactNode }) {
  return <span className="text-13 text-muted tabular-nums">{children}</span>;
}
