// Pay normalization and display (SP3 spec 8.2).
//
// Normalization converts a listing's pay to cents per hour with its weekly hours W, rounding to
// the nearest cent at the end of each conversion: hour ×1; day ÷8; week ÷W; month ×12÷52÷W;
// season ÷(W × season weeks), where season weeks are ceil(inclusive days ÷ 7) for fixed dates
// or 13 for a season and year; year ÷52÷W. A crew share converts its estimate in the estimate's
// own unit. A season unit on an ongoing listing has no hourly figure: it never matches a pay
// filter but still shows its pay.
//
// Display always uses the listing's own unit, never the normalized one.
import type { ListingContent } from '@/modules/listings';

type PayContent = Pick<ListingContent, 'pay' | 'when'>;
type Pay = ListingContent['pay'];
type When = ListingContent['when'];
type RateUnit = Exclude<Pay['unit'], 'crew_share'>;

const DAY_MS = 86_400_000;
/** Weeks in a season named by season and year (spec 8.2). */
const SEASON_WEEKS = 13;
/** The chip writes amounts from $10,000 up as `$Nk`. */
const K_FROM_CENTS = 1_000_000;

const NO_PAY = { minCents: null, maxCents: null, yearlyMinCents: null } as const;

/** Weeks the season unit stands for, or null when the dates don't say (ongoing). */
function seasonWeeks(dates: When['dates']): number | null {
  if (dates.mode === 'season') return SEASON_WEEKS;
  if (dates.mode === 'ongoing') return null;
  const days = Math.round((Date.parse(dates.end) - Date.parse(dates.start)) / DAY_MS) + 1;
  return Math.ceil(days / 7);
}

/** `cents` per `unit` as cents per hour, or null when the unit can't be converted. */
function perHour(cents: number, unit: RateUnit, when: When): number | null {
  const w = when.weeklyHours;
  switch (unit) {
    case 'hour':
      return Math.round(cents);
    case 'day':
      return Math.round(cents / 8);
    case 'week':
      return Math.round(cents / w);
    case 'month':
      return Math.round((cents * 12) / 52 / w);
    case 'season': {
      const weeks = seasonWeeks(when.dates);
      return weeks === null ? null : Math.round(cents / (w * weeks));
    }
    case 'year':
      return Math.round(cents / 52 / w);
  }
}

/** Cents per hour (and per year at 52 weeks), the pure core of toHourlyCents. */
export function normalizePay(c: PayContent): {
  minCents: number | null;
  maxCents: number | null;
  yearlyMinCents: number | null;
} {
  const { pay, when } = c;
  let range: { min: number; max: number; unit: RateUnit };
  if (pay.unit === 'crew_share') {
    const estimate = pay.crewShareEstimate;
    if (!estimate) return { ...NO_PAY };
    range = { min: estimate.minCents, max: estimate.maxCents, unit: estimate.per };
  } else {
    range = { min: pay.minCents, max: pay.maxCents, unit: pay.unit };
  }

  const minCents = perHour(range.min, range.unit, when);
  const maxCents = perHour(range.max, range.unit, when);
  if (minCents === null || maxCents === null) return { ...NO_PAY };
  return { minCents, maxCents, yearlyMinCents: Math.round(minCents * when.weeklyHours * 52) };
}

const SUFFIX: Record<RateUnit, string> = {
  hour: 'hr',
  day: 'day',
  week: 'wk',
  month: 'mo',
  season: 'season',
  year: 'yr',
};

const FREQUENCY: Record<Pay['frequency'], string> = {
  weekly: 'Paid weekly',
  biweekly: 'Paid every 2 weeks',
  semimonthly: 'Paid twice a month',
  monthly: 'Paid monthly',
  end_of_season: 'Paid at the end of the season',
  per_trip: 'Paid per trip',
};

/** 1234567 -> "1,234,567". */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "$19", "$18.50", "$3,200": cents only when there are some. */
function dollars(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = Math.round(cents - whole * 100);
  return `$${grouped(whole)}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

/** "$12k", "$12.5k": thousands with at most one decimal. */
function thousands(cents: number): string {
  const tenths = Math.round(cents / 10_000);
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `$${grouped(whole)}${decimal === 0 ? '' : `.${decimal}`}k`;
}

/**
 * "$19" or "$19–$22". In the chip, a range whose top reaches $10,000 writes both ends in
 * thousands so the two read alike ("$8k–$12k").
 */
function amounts(min: number, max: number, chip: boolean): string {
  const one = chip && Math.max(min, max) >= K_FROM_CENTS ? thousands : dollars;
  return max === min ? one(min) : `${one(min)}–${one(max)}`;
}

/** Overtime, tips, bonuses, the pay frequency and deductions, in that order. */
function detailLines(pay: Pay): string[] {
  const lines: string[] = [];
  if (pay.overtime) lines.push('Overtime available');
  if (pay.tips) lines.push('Tips');
  if (pay.bonuses) lines.push(`Bonus: ${pay.bonuses}`);
  lines.push(FREQUENCY[pay.frequency]);
  if (pay.deductions) lines.push(`Deductions: ${pay.deductions}`);
  return lines;
}

/** The card chip, the full line and the detail lines, in the listing's own unit. */
export function formatPay(c: PayContent): {
  chip: string;
  full: string;
  details: string[];
} {
  const { pay } = c;
  const details = detailLines(pay);

  if (pay.unit === 'crew_share') {
    const estimate = pay.crewShareEstimate;
    if (!estimate) return { chip: 'Crew share', full: 'Crew share', details };
    const suffix = SUFFIX[estimate.per];
    return {
      chip: `est. ${amounts(estimate.minCents, estimate.maxCents, true)}/${suffix}`,
      full: `Crew share · est. ${amounts(estimate.minCents, estimate.maxCents, false)}/${suffix}`,
      details,
    };
  }

  const suffix = SUFFIX[pay.unit];
  return {
    chip: `${amounts(pay.minCents, pay.maxCents, true)}/${suffix}`,
    full: `${amounts(pay.minCents, pay.maxCents, false)}/${suffix}`,
    details,
  };
}
