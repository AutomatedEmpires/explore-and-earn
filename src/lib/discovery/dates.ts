// Dates and seasons in the viewer's time zone (SP3 spec 8.3). Dates are YYYY-MM-DD strings and
// all arithmetic is on UTC calendar days, so no date library and no DST surprises.
//
// - Today is the viewer's date in their IANA zone (an unknown zone falls back to Chicago).
// - Season windows: Spring Mar 1–May 31, Summer Jun 1–Aug 31, Fall Sep 1–Nov 30, Winter Dec 1
//   of year Y to the end of February of Y+1 ("Winter 2026–27"). Year-round has no window.
// - The date line: "Starts today", "Starts tomorrow", "Starts in N days" (2–30), "Begins Jun 1"
//   (with the year when it isn't this year), "Begins now" when the start is past or unknown. A
//   season listing whose window opens more than 30 days out reads its season label instead.
//   The end segment is "Ends Sep 30", "Ongoing" for ongoing and year-round listings, and
//   nothing for the other seasons.
import type { ListingContent } from '@/modules/listings';
import { resolveTimeZone } from './tz';
import type { Season } from './types';

type When = ListingContent['when'];

const DAY_MS = 86_400_000;
const SOON_DAYS = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** YYYY-MM-DD of a UTC calendar date. */
function ymd(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** [year, month 1–12, day] of a YYYY-MM-DD string. */
function parts(d: string): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y ?? 1970, m ?? 1, day ?? 1];
}

const toUtcMs = (d: string) => {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day);
};

const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Days in `month` (1–12) of `year`. */
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Today's date in `tz`. */
export function todayIn(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const get = (type: 'year' | 'month' | 'day') =>
    Number(fmt.formatToParts(now).find((p) => p.type === type)?.value);
  return ymd(get('year'), get('month'), get('day'));
}

export function addDays(d: string, n: number): string {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** The last day of "within N months" of `today`, clamped to the month's end. */
export function withinMonthsEnd(today: string, n: 1 | 3 | 6): string {
  const [y, m, d] = parts(today);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return ymd(year, month, Math.min(d, daysInMonth(year, month)));
}

/** The season's date window, or null for year-round. */
export function seasonWindow(s: Season, year: number): { from: string; to: string } | null {
  switch (s) {
    case 'spring':
      return { from: ymd(year, 3, 1), to: ymd(year, 5, 31) };
    case 'summer':
      return { from: ymd(year, 6, 1), to: ymd(year, 8, 31) };
    case 'fall':
      return { from: ymd(year, 9, 1), to: ymd(year, 11, 30) };
    case 'winter':
      return { from: ymd(year, 12, 1), to: ymd(year + 1, 2, daysInMonth(year + 1, 2)) };
    case 'year_round':
      return null;
  }
}

const SEASON_NAMES: Record<Exclude<Season, 'year_round'>, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/** "Summer 2027", "Winter 2026–27" or "Year-round". */
export function seasonLabel(s: Season, year: number): string {
  if (s === 'year_round') return 'Year-round';
  if (s === 'winter') return `Winter ${year}–${pad((year + 1) % 100)}`;
  return `${SEASON_NAMES[s]} ${year}`;
}

/** The fixed start, else the season window's start, else the ongoing start, else null. */
export function effectiveStart(when: When): string | null {
  const d = when.dates;
  if (d.mode === 'fixed') return d.start;
  if (d.mode === 'season') return seasonWindow(d.season, d.year)?.from ?? null;
  return d.start;
}

/** The fixed end, else the season window's end, else null (ongoing and year-round). */
export function effectiveEnd(when: When): string | null {
  const d = when.dates;
  if (d.mode === 'fixed') return d.end;
  if (d.mode === 'season') return seasonWindow(d.season, d.year)?.to ?? null;
  return null;
}

/** "Jul 2", or "Jan 15, 2027" when the year isn't today's. */
function shortDate(d: string, today: string): string {
  const [y, m, day] = parts(d);
  const label = `${MONTHS[m - 1] ?? ''} ${day}`;
  return y === parts(today)[0] ? label : `${label}, ${y}`;
}

/** The card's info row: "Starts in 3 days", "Begins Jun 1", "Summer 2027", "Ends Sep 30". */
export function dateLine(when: When, today: string): { info: string; end: string | null } {
  const d = when.dates;
  const start = effectiveStart(when);
  const days = start === null ? null : daysBetween(today, start);

  let info: string;
  if (days === null || days < 0) info = 'Begins now';
  else if (d.mode === 'season' && days > SOON_DAYS) info = seasonLabel(d.season, d.year);
  else if (days === 0) info = 'Starts today';
  else if (days === 1) info = 'Starts tomorrow';
  else if (days <= SOON_DAYS) info = `Starts in ${days} days`;
  else info = `Begins ${shortDate(start ?? today, today)}`;

  let end: string | null;
  if (d.mode === 'fixed') end = `Ends ${shortDate(d.end, today)}`;
  else if (d.mode === 'ongoing' || d.season === 'year_round') end = 'Ongoing';
  else end = null;

  return { info, end };
}
