// Pay normalization and display (SP3 spec 8.2).
//
// Normalization turns a listing's pay into cents per hour with its weekly hours W, rounded to
// the nearest cent: hour x1; day /8; week /W; month x12/52/W; season /(W x season weeks), where
// a fixed-date listing's season weeks are ceil(inclusive days / 7) and a season-and-year listing
// has 13; year /52/W. Crew share converts its estimate with the estimate's own unit. A season
// unit on an ongoing listing has no length, so it gives null: the listing never matches a pay
// filter but still shows its pay.
//
// Display keeps the listing's own unit, never the normalized one.
import type { ListingContent } from '@/modules/listings';

type PaySource = Pick<ListingContent, 'pay' | 'when'>;
type Pay = ListingContent['pay'];
/** Every pay unit but crew share, which is paid in its estimate's unit. */
export type PayBaseUnit = Exclude<Pay['unit'], 'crew_share'>;

const WEEKS_PER_YEAR = 52;
const HOURS_PER_DAY = 8;
/** A season of a season-and-year listing (spec 8.2). */
const SEASON_WEEKS = 13;
const DAY_MS = 86_400_000;

/** Weeks of a season-unit pay period, or null when the listing has no season length. */
function seasonWeeks(when: ListingContent['when']): number | null {
  const d = when.dates;
  if (d.mode === 'season') return SEASON_WEEKS;
  if (d.mode === 'fixed') {
    const days = (Date.parse(`${d.end}T00:00:00Z`) - Date.parse(`${d.start}T00:00:00Z`)) / DAY_MS;
    return Math.ceil((days + 1) / 7);
  }
  return null;
}

/** Working hours in one `unit` of pay, or null when the unit has no length (season, ongoing). */
export function hoursPerUnit(unit: PayBaseUnit, when: ListingContent['when']): number | null {
  const w = when.weeklyHours;
  switch (unit) {
    case 'hour':
      return 1;
    case 'day':
      return HOURS_PER_DAY;
    case 'week':
      return w;
    case 'month':
      return (w * WEEKS_PER_YEAR) / 12;
    case 'season': {
      const weeks = seasonWeeks(when);
      return weeks === null ? null : w * weeks;
    }
    case 'year':
      return w * WEEKS_PER_YEAR;
  }
}

/** The amounts and unit that normalization and display read: crew share uses its estimate. */
function effectiveRange(pay: Pay): { min: number; max: number; unit: PayBaseUnit } | null {
  if (pay.unit === 'crew_share') {
    const e = pay.crewShareEstimate;
    return e ? { min: e.minCents, max: e.maxCents, unit: e.per } : null;
  }
  return { min: pay.minCents, max: pay.maxCents, unit: pay.unit };
}

/** Cents per hour (and per year at 52 weeks), the pure core of toHourlyCents. */
export function normalizePay(c: PaySource): {
  minCents: number | null;
  maxCents: number | null;
  yearlyMinCents: number | null;
} {
  const range = effectiveRange(c.pay);
  const hours = range ? hoursPerUnit(range.unit, c.when) : null;
  if (!range || hours === null || !(hours > 0)) {
    return { minCents: null, maxCents: null, yearlyMinCents: null };
  }
  const minCents = Math.round(range.min / hours);
  const maxCents = Math.round(Math.max(range.max, range.min) / hours);
  const yearlyMinCents = Math.round(minCents * c.when.weeklyHours * WEEKS_PER_YEAR);
  return { minCents, maxCents, yearlyMinCents };
}

const UNIT_SUFFIX: Record<PayBaseUnit, string> = {
  hour: '/hr',
  day: '/day',
  week: '/wk',
  month: '/mo',
  season: '/season',
  year: '/yr',
};

const FREQUENCY_LINE: Record<Pay['frequency'], string> = {
  weekly: 'Paid weekly',
  biweekly: 'Paid every 2 weeks',
  semimonthly: 'Paid twice a month',
  monthly: 'Paid monthly',
  end_of_season: 'Paid at the end of the season',
  per_trip: 'Paid per trip',
};

/** The chip writes amounts from $10,000 up in thousands. */
const THOUSANDS_FROM_CENTS = 1_000_000;

/** "$19", "$18.50", "$3,200". */
export function formatDollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "$12k", "$12.5k": at most one decimal. */
function thousands(cents: number): string {
  const k = Math.round(cents / 10_000) / 10;
  return `$${k.toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
}

/**
 * "$19" or "$19–$22". With `short` (the chip), a range whose top reaches $10,000 writes both
 * ends in thousands, so a crew share reads "$8k–$12k" rather than "$8,000–$12k".
 */
function amounts(min: number, max: number, short: boolean): string {
  const inThousands = short && Math.max(min, max) >= THOUSANDS_FROM_CENTS;
  const one = (cents: number) => (inThousands ? thousands(cents) : formatDollars(cents));
  return max > min ? `${one(min)}–${one(max)}` : one(min);
}

/** The card chip, the full line and the detail lines, in the listing's own unit. */
export function formatPay(c: PaySource): {
  chip: string;
  full: string;
  details: string[];
} {
  const pay = c.pay;
  const details: string[] = [];
  if (pay.overtime) details.push('Overtime available');
  if (pay.tips) details.push('Tips');
  if (pay.bonuses) details.push(`Bonus: ${pay.bonuses}`);
  details.push(FREQUENCY_LINE[pay.frequency]);
  if (pay.deductions) details.push(`Deductions: ${pay.deductions}`);

  if (pay.unit === 'crew_share') {
    const e = pay.crewShareEstimate;
    if (!e) return { chip: 'Crew share', full: 'Crew share', details };
    const suffix = UNIT_SUFFIX[e.per];
    return {
      chip: `est. ${amounts(e.minCents, e.maxCents, true)}${suffix}`,
      full: `Crew share · est. ${amounts(e.minCents, e.maxCents, false)}${suffix}`,
      details,
    };
  }
  const suffix = UNIT_SUFFIX[pay.unit];
  const max = pay.kind === 'fixed' ? pay.minCents : pay.maxCents;
  return {
    chip: `${amounts(pay.minCents, max, true)}${suffix}`,
    full: `${amounts(pay.minCents, max, false)}${suffix}`,
    details,
  };
}
