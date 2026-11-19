// The Profile hub's missing-item line (SP4 spec 8.3). Client-safe and pure.
import type { MissingItem, MissingItemInput } from './types';

/** Confirmed this long ago, the start date is stale and the seeker leaves the pools. */
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The first item, in MissingItem order, that keeps a visible seeker out of pools; null when
 * nothing is missing or "Visible to hosts" is off. Availability confirmed 90 days before
 * `now` or earlier is `availability_stale`.
 */
export function missingItem(p: MissingItemInput, now: Date): MissingItem | null {
  if (!p.visibleToHosts) return null;
  if (p.firstName.trim() === '') return 'name';
  if (p.city.trim() === '') return 'location';
  if (!p.availability) return 'availability';
  const confirmed = new Date(p.availability.confirmedAt).getTime();
  if (now.getTime() - confirmed >= STALE_MS) return 'availability_stale';
  if (p.categories.length === 0 && p.occupations.length === 0) return 'category';
  if (!p.workAuthorization) return 'work_authorization';
  return null;
}
