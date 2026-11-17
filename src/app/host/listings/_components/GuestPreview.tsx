'use client';

// "What guests see" (Figma 43:14603): the seeker JobCard built from the draft as it is typed.
// It is a picture of the card, so it is inert; a sentence gives screen readers the same facts.
import { JobCard, type PayPeriod } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatDay, money } from '../_lib/format';
import { CATEGORY_LABEL, categoryOf } from '../_lib/model';
import { getPath, num, obj, str } from '../_lib/paths';
import type { Json } from '../_lib/paths';
import type { HostLocation } from '../_lib/sample';
import { useMediaUrl } from './PhotoSlot';

const SEASON_LABEL: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
  year_round: 'All year',
};

const PAY_PERIODS: readonly PayPeriod[] = ['hour', 'day', 'week', 'month', 'season', 'year'];

/** The card's facts from the draft, for the card and the sentence beside it. */
export function cardFacts(draft: Json, orgName: string, locations: HostLocation[] | null) {
  const title = str(getPath(draft, 'basics.title'))?.trim() || 'Job title';
  const category = categoryOf(draft) ?? 'seasonal';
  const where = obj(draft.where);
  const locationId = str(where.mode === 'remote' ? where.hostLocationId : where.locationId);
  const loc = locations?.find((l) => l.id === locationId);
  const place = where.mode === 'remote' ? 'Remote' : loc ? `${loc.city}, ${loc.state}` : 'Location';
  const dates = obj(getPath(draft, 'when.dates'));
  let starts: { on: string } | { label: string } = { label: 'Dates to come' };
  let endsOn: string | undefined;
  let endLabel: string | undefined;
  if (dates.mode === 'fixed' && str(dates.start)) {
    starts = { on: formatDay(str(dates.start) ?? '') };
    if (str(dates.end)) endsOn = formatDay(str(dates.end) ?? '');
  } else if (dates.mode === 'season' && str(dates.season)) {
    starts = {
      label: `${SEASON_LABEL[str(dates.season) ?? ''] ?? ''} ${num(dates.year) ?? ''}`.trim(),
    };
  } else if (dates.mode === 'ongoing') {
    starts = str(dates.start)
      ? { on: formatDay(str(dates.start) ?? '') }
      : { label: 'Starts when hired' };
    endLabel = 'Ongoing';
  }
  const pay = obj(draft.pay);
  const min = num(pay.minCents);
  const max = num(pay.maxCents);
  const crew = obj(pay.crewShareEstimate);
  const unit = pay.unit === 'crew_share' ? str(crew.per) : str(pay.unit);
  const per = PAY_PERIODS.find((p) => p === unit);
  const payValue =
    min !== undefined && per
      ? { amountCents: min, maxAmountCents: max !== undefined && max > min ? max : undefined, per }
      : { label: min !== undefined ? money(min) : 'Pay' };
  return {
    title,
    category,
    place,
    starts,
    endsOn,
    endLabel,
    pay: payValue,
    housing: getPath(draft, 'housing.provided') === true,
    meals: getPath(draft, 'meals.provided') === true,
    orgName,
  };
}

export function GuestPreview({
  draft,
  orgName,
  locations,
  coverPreview,
  className,
  headingId,
}: {
  draft: Json;
  orgName: string;
  locations: HostLocation[] | null;
  /** A photo picked in this visit, shown before the server has checked it. */
  coverPreview: string | null;
  className?: string;
  headingId: string;
}) {
  const facts = cardFacts(draft, orgName, locations);
  const coverId = str(getPath(draft, 'photos.coverMediaId')) ?? null;
  const remote = useMediaUrl(coverPreview ? null : coverId);
  const coverSrc = coverPreview ?? remote;
  const housing = facts.housing ? 'housing provided' : 'no housing';
  const meals = facts.meals ? 'meals provided' : 'no meals';
  const pay = 'label' in facts.pay ? facts.pay.label : '';
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <h2 id={headingId} className="text-16 font-bold text-ink">
        What guests see
      </h2>
      <p className="sr-only">
        {facts.title} at {orgName}, {facts.place}. {CATEGORY_LABEL[facts.category]}, {housing},{' '}
        {meals}
        {pay ? `, ${pay}` : ''}.
      </p>
      <div inert className="w-full max-w-96">
        <JobCard
          href="#"
          position={facts.title}
          host={{ name: orgName }}
          location={facts.place}
          category={facts.category}
          cover={coverSrc ? { src: coverSrc, alt: '' } : null}
          starts={facts.starts}
          endsOn={facts.endsOn}
          endLabel={facts.endLabel}
          housing={{ provided: facts.housing }}
          meals={{ provided: facts.meals }}
          pay={facts.pay}
          titleAs="h3"
        />
      </div>
    </section>
  );
}
