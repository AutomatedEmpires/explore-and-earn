// Availability rules (SP4 spec 8.2). Client-safe and pure: the Availability sheet's live line and
// the server's setAvailability use the same functions.
import type { AvailabilityInput, AvailabilityResolution } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

function iso(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Adds calendar months, clamping the day to the target month's last day. */
function addMonths(date: string, months: number): string {
  const { y, m, d } = parts(date);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = index % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return iso(ty, tm + 1, Math.min(d, last));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The date a preset stores: `now` is clientToday; `1_month` and `3_months` add calendar months,
 * clamped to the month's last day; `beyond` is a picked date after clientToday + 3 months;
 * `exact` is any date from clientToday. Dates go up to clientToday + 2 years.
 */
export function resolveAvailability(i: AvailabilityInput): AvailabilityResolution {
  const latest = addMonths(i.clientToday, 24);
  if (i.preset === 'now') return { ok: true, date: i.clientToday };
  if (i.preset === '1_month') return { ok: true, date: addMonths(i.clientToday, 1) };
  if (i.preset === '3_months') return { ok: true, date: addMonths(i.clientToday, 3) };
  if (!i.date) return { ok: false, reason: 'date_required' };
  if (compare(i.date, latest) > 0) return { ok: false, reason: 'date_too_far' };
  if (i.preset === 'exact') {
    if (compare(i.date, i.clientToday) < 0) return { ok: false, reason: 'date_before_today' };
    return { ok: true, date: i.date };
  }
  const after = addMonths(i.clientToday, 3);
  if (compare(i.date, after) <= 0) return { ok: false, reason: 'beyond_too_soon' };
  return { ok: true, date: i.date };
}

/** Whole days since the confirmation (0 reads "Confirmed today"). */
export function confirmedDaysAgo(confirmedAt: string | Date, now: Date): number {
  const then = confirmedAt instanceof Date ? confirmedAt.getTime() : new Date(confirmedAt).getTime();
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/** "Available from Dec 3, 2026". */
export function formatAvailableFrom(date: string): string {
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
  return `Available from ${label}`;
}

/** The server's UTC calendar date. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whether the client's date is within a day of the server's UTC date. */
export function checkClientToday(clientToday: string, now: Date): boolean {
  const server = Date.parse(`${utcDay(now)}T00:00:00Z`);
  const client = Date.parse(`${clientToday}T00:00:00Z`);
  return Math.abs(client - server) <= DAY_MS;
}
