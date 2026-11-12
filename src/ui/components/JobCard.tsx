import type { MouseEvent } from 'react';
import type { Category } from '@/ui/categories';
import {
  BadgeCheck,
  Banknote,
  BedDouble,
  Bookmark,
  CalendarDays,
  Clock,
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

export type PayPeriod = 'hour' | 'day' | 'week' | 'month' | 'season' | 'year';
export type Pay = { amountCents: number; maxAmountCents?: number; per: PayPeriod };
export type JobCardChip = 'housing' | 'meals' | 'pay';

/**
 * Pay after housing and meals (legal review section 9), under the chips. Discovery decides when
 * it may be shown and writes both lines; the card only lays them out.
 */
export type JobCardPayEstimate = {
  /** e.g. "About $796 a week after housing and meals". */
  line: string;
  /** e.g. "Before taxes. Based on 40 hours a week at $22 an hour, less $84 a week for ...". */
  basis: string;
  /** Opens the "How we work this out" sheet; without it the link is left out. */
  onExplain?: () => void;
};

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
  /**
   * Collapse the cover, its badges and the host logo, for a job with no cover photo (SE-19).
   * Off by default, so a card without a photo keeps the neutral cover.
   */
  hideCover?: boolean;
  /**
   * "Starts in N days" or "Begins [date]"; dates arrive formatted for display. A `label` is
   * shown as given (discovery writes its own date line, e.g. "Summer 2027").
   */
  starts: { inDays: number } | { on: string } | { label: string };
  endsOn?: string;
  /** The whole end segment, e.g. "Ongoing"; shown as "· {endLabel}" in place of `endsOn`. */
  endLabel?: string;
  /** The freshness line under the dates, e.g. "Confirmed active 2 days ago" (P0-11, SE-9). */
  freshness?: string;
  /** Provided is green whether housing is free or paid; the cost is in the pop-up. */
  housing: { provided: boolean };
  meals: { provided: boolean };
  /** A Pay to format, or a preformatted chip label such as "$19–$22/hr" or "$52k/yr". */
  pay: Pay | { label: string };
  payEstimate?: JobCardPayEstimate;
  saved?: boolean;
  /** The seeker has applied: the Apply button reads "Applied" and is disabled. */
  applied?: boolean;
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
  year: 'yr',
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * `{ amountCents: 1900, per: 'hour' }` -> "$19/hr"; a range -> "$18.50–22/hr";
 * `{ amountCents: 4500000, per: 'year' }` -> "$45,000/yr".
 */
export function formatPay({ amountCents, maxAmountCents, per }: Pay): string {
  const range =
    maxAmountCents !== undefined && maxAmountCents > amountCents
      ? `–${dollars(maxAmountCents)}`
      : '';
  return `$${dollars(amountCents)}${range}/${perLabel[per]}`;
}

/** The Pay chip's value: a preformatted label as given, otherwise `formatPay`. */
export function payLabel(pay: JobCardProps['pay']): string {
  return 'label' in pay ? pay.label : formatPay(pay);
}

export function formatStart(starts: JobCardProps['starts']): string {
  if ('label' in starts) return starts.label;
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
  hideCover = false,
  starts,
  endsOn,
  endLabel,
  freshness,
  housing,
  meals,
  pay,
  payEstimate,
  saved = false,
  applied = false,
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
      hideCover={hideCover}
      cover={
        cover ? (
          // A 4:3 photo as wide as the cover, centred and cropped by it at every width (D3-3).
          <Img
            src={cover.src}
            srcSet={cover.srcSet}
            alt={cover.alt}
            className="absolute top-1/2 left-0 aspect-4/3 min-h-full w-full -translate-y-1/2 object-cover object-center"
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
          {endLabel ? <span>· {endLabel}</span> : endsOn ? <span>· Ends {endsOn}</span> : null}
        </>
      }
      note={
        freshness ? (
          <>
            <Clock className="size-3.75 shrink-0" />
            <span>{freshness}</span>
          </>
        ) : null
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
        <Chip key="pay" label="Pay" icon={Banknote} value={payLabel(pay)} onOpen={open('pay')} />,
      ]}
      belowChips={
        payEstimate ? (
          <div className="flex flex-col items-start">
            <p className="text-16 font-semibold wrap-anywhere text-ink">{payEstimate.line}</p>
            <p className="mt-0.5 text-14 wrap-anywhere text-muted">{payEstimate.basis}</p>
            {payEstimate.onExplain ? (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={payEstimate.onExplain}
                className="flex min-h-11 items-center rounded-sm text-14 font-semibold text-ink underline underline-offset-2 hover:no-underline"
              >
                How we work this out
              </button>
            ) : null}
          </div>
        ) : null
      }
      actions={
        hideActions ? null : (
          <>
            <IconButton icon={X} label="Skip" variant="outline" size="lg" onClick={onSkip} />
            <Button size="lg" className="flex-1" disabled={applied} onClick={onApply}>
              {applied ? 'Applied' : 'Apply'}
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
