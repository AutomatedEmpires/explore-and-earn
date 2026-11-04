// Listing time rules in the listing's own timezone (spec section 8.2): auto-close at local
// midnight after a fixed end date, the application deadline, and the "Still hiring?" schedule.

const DAY_MS = 86_400_000;

/** The calendar date (YYYY-MM-DD) at `at` in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** How far `timeZone` is ahead of UTC at the instant `ms`, in milliseconds. */
function tzOffsetMs(ms: number, timeZone: string): number {
  let format = offsetFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    offsetFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant of 00:00 local time on the day after `date` (YYYY-MM-DD) in `timeZone`,
 * using the offset in force at that midnight (Review Focus 4).
 */
export function zonedMidnightAfter(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1);
  const offset1 = tzOffsetMs(guess, timeZone);
  const t = guess - offset1;
  const offset2 = tzOffsetMs(t, timeZone);
  return new Date(offset2 === offset1 ? t : guess - offset2);
}

type Dates =
  | { mode: 'fixed'; start: string; end: string }
  | { mode: 'season'; season: string; year: number }
  | { mode: 'ongoing'; start: string | null };

/** Only a fixed end date closes a listing on its own; season and ongoing listings never do. */
export function computeAutoCloseAt(when: { dates: Dates }, timeZone: string): Date | null {
  return when.dates.mode === 'fixed' ? zonedMidnightAfter(when.dates.end, timeZone) : null;
}

/** When applications stop (the listing stays active): local midnight after the deadline. */
export function computeApplicationsCloseAt(
  deadline: string | null | undefined,
  timeZone: string,
): Date | null {
  return deadline ? zonedMidnightAfter(deadline, timeZone) : null;
}

/** The next "Still hiring?" reminder: 30, 60 and 90 days after first publish, then every 90. */
export function nextReminderAt(firstPublishedAt: Date, remindersSent: number): Date {
  const n = Math.max(0, Math.floor(remindersSent));
  const days = n < 3 ? ([30, 60, 90][n] ?? 30) : 90 * (n - 1);
  return new Date(firstPublishedAt.getTime() + days * DAY_MS);
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(n).padStart(2, '0');

/** `date` (YYYY-MM-DD) `years` later; Feb 29 becomes Feb 28 in a non-leap year. */
export function addYears(date: string, years: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const year = y + years;
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${pad(m)}-${pad(day)}`;
}

/** The last day of a season (winter runs into February of the next year). */
export function seasonEnd(season: string, year: number): string {
  switch (season) {
    case 'spring':
      return `${year}-05-31`;
    case 'summer':
      return `${year}-08-31`;
    case 'fall':
      return `${year}-11-30`;
    case 'winter':
      return `${year + 1}-02-${isLeap(year + 1) ? 29 : 28}`;
    default:
      return `${year}-12-31`;
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * A repost's dates (spec section 8.2): every date, the season year and the deadline move
 * forward by the smallest whole number of years (at least one) that puts the end date (fixed),
 * the start date (ongoing) or the season's end after `today`.
 */
export function shiftListingDates<T>(content: T, today: string): T {
  const out = structuredClone(content) as Json;
  const when = obj(out.when);
  const dates = obj(when?.dates);

  const reference = (k: number): string | null => {
    if (!dates) return null;
    if (dates.mode === 'fixed' && isDate(dates.end)) return addYears(dates.end, k);
    if (dates.mode === 'ongoing' && isDate(dates.start)) return addYears(dates.start, k);
    if (
      dates.mode === 'season' &&
      typeof dates.year === 'number' &&
      typeof dates.season === 'string'
    ) {
      return seasonEnd(dates.season, dates.year + k);
    }
    return null;
  };

  let k = 1;
  if (reference(1) !== null) {
    while ((reference(k) ?? '') <= today && k < 200) k += 1;
  }

  if (dates) {
    if (isDate(dates.start)) dates.start = addYears(dates.start, k);
    if (isDate(dates.end)) dates.end = addYears(dates.end, k);
    if (typeof dates.year === 'number') dates.year += k;
  }
  const applying = obj(out.applying);
  if (applying && isDate(applying.deadline)) applying.deadline = addYears(applying.deadline, k);
  return out as T;
}
