import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/ui/cn';

/** The shared card always has exactly three pop-up chips (product spec section 4). */
export type CardChips = readonly [ReactNode, ReactNode, ReactNode];

export type CardProps = Omit<ComponentProps<'article'>, 'title' | 'children'> & {
  /** Fills the cover area (an image, or nothing for the neutral placeholder). */
  cover?: ReactNode;
  /** Top left of the cover: category, "Boosted", candidate interests. */
  coverBadge?: ReactNode;
  /** Top right of the cover: the Swipe info button or a status such as "Applied 2 days ago". */
  coverAction?: ReactNode;
  /** The logo tile or avatar that overlaps the bottom of the cover. */
  identity?: ReactNode;
  /** Usually a CardTitleLink: the visible link to the detail page, stretched over the card. */
  title: ReactNode;
  titleAs?: 'h2' | 'h3';
  subtitle?: ReactNode;
  info?: ReactNode;
  chips: CardChips;
  actions?: ReactNode;
  coverSize?: 'md' | 'lg';
};

/**
 * The one card template that job cards and candidate cards fill differently.
 * Tapping anywhere on the card except a button or chip follows the title link: the link's
 * ::after covers the card, and the interactive slots sit above it (z-10).
 */
export function Card({
  cover,
  coverBadge,
  coverAction,
  identity,
  title,
  titleAs: Title = 'h2',
  subtitle,
  info,
  chips,
  actions,
  coverSize = 'lg',
  className,
  ...props
}: CardProps) {
  return (
    <article
      className={cn('relative overflow-hidden rounded-xl bg-surface shadow-card', className)}
      {...props}
    >
      <div className={cn('relative bg-surface-2', coverSize === 'lg' ? 'h-47' : 'h-42')}>
        <div className="absolute inset-0 overflow-hidden">{cover}</div>
        {coverBadge ? (
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
            {coverBadge}
          </div>
        ) : null}
        {coverAction ? <div className="absolute top-3 right-3 z-10">{coverAction}</div> : null}
        {identity ? <div className="absolute -bottom-7 left-4 z-10 flex">{identity}</div> : null}
      </div>
      <div className={cn('px-4 pb-4', identity ? 'pt-9' : 'pt-4')}>
        <Title className="text-21 font-bold text-ink">{title}</Title>
        {subtitle ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-1 text-14 text-ink-2">{subtitle}</p>
        ) : null}
        {info ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-13 text-muted">{info}</p>
        ) : null}
        <div className="relative z-10 mt-3.5 grid grid-cols-3 gap-2">
          {chips[0]}
          {chips[1]}
          {chips[2]}
        </div>
        {actions ? (
          <div className="relative z-10 mt-3.5 flex items-center gap-2.5">{actions}</div>
        ) : null}
      </div>
    </article>
  );
}

export type CardTitleLinkProps = ComponentProps<'a'> & { href: string };

/** The card's title link; its ::after makes the whole card body open the detail page. */
export function CardTitleLink({ className, children, ...props }: CardTitleLinkProps) {
  return (
    <a
      className={cn(
        'text-ink no-underline after:absolute after:inset-0 hover:underline',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
