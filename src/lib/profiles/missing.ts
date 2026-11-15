// The Profile hub's missing-item line (SP4 spec 8.3). Client-safe and pure. W0 stub: W1
// implements it (Task 8).
import type { MissingItem, MissingItemInput } from './types';

/**
 * The first item, in MissingItem order, that keeps a visible seeker out of pools; null when
 * nothing is missing or "Visible to hosts" is off. Availability confirmed more than 90 days
 * before `now` is `availability_stale`.
 */
export function missingItem(_p: MissingItemInput, _now: Date): MissingItem | null {
  throw new Error('not implemented: missingItem');
}
