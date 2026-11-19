// Period bounds for host analytics. Seasons are meteorological and local to `tz`.
import type { AnalyticsRange } from '@/lib/host-analytics';
import { zonedLocalToUtc } from '@/lib/hiring';

export type ResolvedRange = {
  from: Date;
  to: Date;
  previous: { from: Date; to: Date } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function localParts(tz: string, now: Date): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: read('year'), m: read('month') };
}

function atMidnight(y: number, m: number, d: number, tz: string): Date {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return new Date(zonedLocalToUtc(`${iso}T00:00`, tz));
}

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

/** Meteorological season containing the local month: Mar, Jun, Sep, or Dec. */
function seasonStart(y: number, m: number): { y: number; m: number } {
  if (m >= 3 && m <= 5) return { y, m: 3 };
  if (m >= 6 && m <= 8) return { y, m: 6 };
  if (m >= 9 && m <= 11) return { y, m: 9 };
  if (m === 12) return { y, m: 12 };
  return { y: y - 1, m: 12 };
}

function season(tz: string, now: Date): ResolvedRange {
  const { y, m } = localParts(tz, now);
  const start = seasonStart(y, m);
  const end = addMonths(start.y, start.m, 3);
  const previous = addMonths(start.y, start.m, -3);
  return {
    from: atMidnight(start.y, start.m, 1, tz),
    to: atMidnight(end.y, end.m, 1, tz),
    previous: {
      from: atMidnight(previous.y, previous.m, 1, tz),
      to: atMidnight(start.y, start.m, 1, tz),
    },
  };
}

/**
 * `7d`, `30d` and `90d` end at `now` with a previous period of the same length.
 * `season` is the local meteorological season against the one before.
 * `all` ends at `now`, starts at the epoch, and has no previous period; the caller
 * moves `from` to the org's first pipeline event.
 */
export function resolveRange(range: AnalyticsRange, tz: string, now: Date): ResolvedRange {
  if (range === 'all') return { from: new Date(0), to: now, previous: null };
  if (range === 'season') return season(tz, now);
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const to = now;
  const from = new Date(now.getTime() - days * DAY_MS);
  return {
    from,
    to,
    previous: { from: new Date(from.getTime() - days * DAY_MS), to: from },
  };
}
