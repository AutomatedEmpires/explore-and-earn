// Availability rules (SP4 spec 8.2). Client-safe and pure: the Availability sheet's live line and
// the server's setAvailability use the same functions. W0 stub: W1 implements it (Task 10).
import type { AvailabilityInput, AvailabilityResolution } from './types';

/**
 * The date a preset stores: `now` is clientToday; `1_month` and `3_months` add calendar months,
 * clamped to the month's last day; `beyond` is a picked date after clientToday + 3 months;
 * `exact` is any date from clientToday. Dates go up to clientToday + 2 years.
 */
export function resolveAvailability(_i: AvailabilityInput): AvailabilityResolution {
  throw new Error('not implemented: resolveAvailability');
}

/** Whole days since the confirmation (0 reads "Confirmed today"). */
export function confirmedDaysAgo(_confirmedAt: string | Date, _now: Date): number {
  throw new Error('not implemented: confirmedDaysAgo');
}

/** "Available from Dec 3, 2026". */
export function formatAvailableFrom(_date: string): string {
  throw new Error('not implemented: formatAvailableFrom');
}

/** Whether the client's date is within a day of the server's UTC date. */
export function checkClientToday(_clientToday: string, _now: Date): boolean {
  throw new Error('not implemented: checkClientToday');
}
