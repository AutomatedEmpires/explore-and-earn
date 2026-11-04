import type { MouseEvent } from 'react';
import type { Category } from '@/ui/categories';
import {
  BadgeCheck,
  Banknote,
  BedDouble,
  Bookmark,
  CalendarDays,
  Info,
  Sparkles,
  Utensils,
  X,
} from '@/ui/icons';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card, CardTitleLink } from './Card';
import { CategoryBadge } from './CategoryBadge';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { Img } from './Img';
import { OrgLogo } from './OrgLogo';

export type PayPeriod = 'hour' | 'day' | 'week' | 'month' | 'season';
export type Pay = { amountCents: number; maxAmountCents?: number; per: PayPeriod };
export type JobCardChip = 'housing' | 'meals' | 'pay';

export type JobCardProps = {
  /** The listing detail page; the title links there and the card body opens it. */
  href: string;
  position: string;
  host: { name: string; logoSrc?: string | null; href?: string; subscriber?: boolean };
  /** General location, e.g. "Seward, AK". */
  location: string;
  category: Category;
  boosted?: boolean;
  cover?: { src: string; alt: string; srcSet?: string } | null;
  /** "Starts in N days" or "Begins [date]"; dates arrive formatted for display. */
  starts: { inDays: number } | { on: string };
  endsOn?: string;
  /** Provided is green whether housing is free or paid; the cost is in the pop-up. */
  housing: { provided: boolean };
  meals: { provided: boolean };
  pay: Pay;
  saved?: boolean;
  onOpenChip?: (chip: JobCardChip) => void;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Swipe shows an info button on the photo that also opens the listing. */
  onInfo?: () => void;
  onSkip?: () => void;
  onApply?: () => void;
  onSave?: () => void;
  hideActions?: boolean;
  titleAs?: 'h2' | 'h3';
  className?: string;
};

const perLabel: Record<PayPeriod, string> = {
  hour: 'hr',
  day: 'day',
  week: 'wk',
  month: 'mo',
  season: 'season',
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** `{ amountCents: 1900, per: 'hour' }` -> "$19/hr"; a range -> "$18.50–22/hr". */
export function formatPay({ amountCents, maxAmountCents, per }: Pay): string {
  const range =
    maxAmountCents !== undefined && maxAmountCents > amountCents
      ? `–${dollars(maxAmountCents)}`
      : '';
  return `$${dollars(amountCents)}${range}/${perLabel[per]}`;
}

export function formatStart(starts: JobCardProps['starts']): string {
  if ('on' in starts) return `Begins ${starts.on}`;
  if (starts.inDays <= 0) return 'Starts today';
  return `Starts in ${starts.inDays} ${starts.inDays === 1 ? 'day' : 'days'}`;
}

/** The job card a seeker sees: the shared Card with the job's fields (product spec section 4). */
export function JobCard({
  href,
  position,
  host,
  location,
  category,
  boosted = false,
  cover,
  starts,
  endsOn,
  housing,
  meals,
  pay,
  saved = false,
  onOpenChip,
  onOpen,
  onInfo,
  onSkip,
  onApply,
  onSave,
  hideActions = false,
  titleAs,
  className,
}: JobCardProps) {
  const open = (chip: JobCardChip) => (onOpenChip ? () => onOpenChip(chip) : undefined);
  const logo = (
    <OrgLogo name={host.name} src={host.logoSrc} size="lg" ring decorative={!!host.href} />
  );

  return (
    <Card
      className={className}
      titleAs={titleAs}
      cover={
        cover ? (
          <Img
            src={cover.src}
            srcSet={cover.srcSet}
            alt={cover.alt}
            className="size-full object-cover"
          />
        ) : null
      }
      coverBadge={
        <>
          <CategoryBadge category={category} />
          {boosted ? (
            <Badge tone="surface" icon={Sparkles}>
              Boosted
            </Badge>
          ) : null}
        </>
      }
      coverAction={
        onInfo ? (
          <IconButton icon={Info} label="Details" variant="overlay" onClick={onInfo} />
        ) : null
      }
      identity={
        host.href ? (
          // Named by its text, not an aria-label: the logo's initials would be visible text
          // missing from the name (WCAG 2.5.3, label in name).
          <a href={host.href} className="flex rounded-lg">
            {logo}
            <span className="sr-only">{host.name} host page</span>
          </a>
        ) : (
          logo
        )
      }
      title={
        <CardTitleLink href={href} onClick={onOpen}>
          {position}
        </CardTitleLink>
      }
      subtitle={
        <>
          <span>{host.name}</span>
          {host.subscriber ? (
            <BadgeCheck role="img" aria-label="Active subscriber" className="size-3.75 text-ink" />
          ) : null}
          <span className="text-muted">· {location}</span>
        </>
      }
      info={
        <>
          <CalendarDays className="size-3.75" />
          <span className="font-semibold text-ink">{formatStart(starts)}</span>
          {endsOn ? <span>· Ends {endsOn}</span> : null}
        </>
      }
      chips={[
        <Chip
          key="housing"
          label="Housing"
          icon={BedDouble}
          value={housing.provided ? 'Provided' : 'No housing'}
          tone={housing.provided ? 'success' : 'muted'}
          onOpen={open('housing')}
        />,
        <Chip
          key="meals"
          label="Meals"
          icon={Utensils}
          value={meals.provided ? 'Provided' : 'No meals'}
          tone={meals.provided ? 'success' : 'muted'}
          onOpen={open('meals')}
        />,
        <Chip key="pay" label="Pay" icon={Banknote} value={formatPay(pay)} onOpen={open('pay')} />,
      ]}
      actions={
        hideActions ? null : (
          <>
            <IconButton icon={X} label="Skip" variant="outline" size="lg" onClick={onSkip} />
            <Button size="lg" className="flex-1" onClick={onApply}>
              Apply
            </Button>
            <IconButton
              icon={Bookmark}
              label="Save"
              variant="outline"
              size="lg"
              aria-pressed={saved}
              onClick={onSave}
            />
          </>
        )
      }
    />
  );
}
