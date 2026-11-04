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
