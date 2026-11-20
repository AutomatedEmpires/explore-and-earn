// Dates and seasons in the viewer's time zone (SP3 spec 8.3). Dates are YYYY-MM-DD strings.
// W0 stub: W1 replaces the bodies (Task 7).
import type { ListingContent } from '@/modules/listings';
import type { Season } from './types';

/** Today's date in `tz`. */
export function todayIn(_tz: string, _now?: Date): string {
  throw new Error('not implemented: todayIn');
}

export function addDays(_d: string, _n: number): string {
  throw new Error('not implemented: addDays');
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(_a: string, _b: string): number {
  throw new Error('not implemented: daysBetween');
}

/** The last day of "within N months" of `today`, clamped to the month's end. */
export function withinMonthsEnd(_today: string, _n: 1 | 3 | 6): string {
  throw new Error('not implemented: withinMonthsEnd');
}

/** The season's date window, or null for year-round. */
export function seasonWindow(_s: Season, _year: number): { from: string; to: string } | null {
  throw new Error('not implemented: seasonWindow');
}

/** "Summer 2027", "Winter 2026–27" or "Year-round". */
export function seasonLabel(_s: Season, _year: number): string {
  throw new Error('not implemented: seasonLabel');
}

/** The fixed start, else the season window's start, else the ongoing start, else null. */
export function effectiveStart(_when: ListingContent['when']): string | null {
  throw new Error('not implemented: effectiveStart');
}

export function effectiveEnd(_when: ListingContent['when']): string | null {
  throw new Error('not implemented: effectiveEnd');
}

/** The card's info row: "Starts in 3 days", "Begins Jun 1", "Summer 2027", "Ends Sep 30". */
export function dateLine(
  _when: ListingContent['when'],
  _today: string,
): { info: string; end: string | null } {
  throw new Error('not implemented: dateLine');
}
