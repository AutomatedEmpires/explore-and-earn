// Fit scoring with the legal switches (SP5 spec 8.3, plan Task 13). Reads only: the settings,
// SP4's FitInputs and the listing. Callers store the results (`fit-store.ts`, the pool refresh).
//
// The switches are the automated hiring tools controls (issue 116, SP8 `legal.fit_score`):
// `hiring.fit_enabled = false` turns fit off everywhere, and `hiring.fit_disabled_states` turns
// it off for listings located in those states. A Remote listing counts as located in every state
// it hires from (plan decision 13), so `all_us` is off whenever any state is disabled.
import type { Db } from '@/lib/db';
import type { FitResult } from '@/lib/hiring';
import { todayInZone } from '@/lib/hiring';
import { toHourlyCents } from '@/modules/discovery';
import { listOccupations, type ListingHiringInfo } from '@/modules/listings';
import { getFitInputs } from '@/modules/profiles';
import { getSetting } from '@/modules/settings';
import { computeFit } from './compute';
import { toFitListing } from './listing';
import { FIT_WEIGHTS, FIT_WEIGHTS_VERSION } from './weights';

export async function fitAvailable(db: Db, h: ListingHiringInfo): Promise<boolean> {
  if (!(await getSetting(db, 'hiring.fit_enabled'))) return false;
  const disabled: readonly string[] = await getSetting(db, 'hiring.fit_disabled_states');
  if (disabled.length === 0) return true;
  if (h.remoteStates === 'all_us') return false;
  if (h.remoteStates !== null) return !h.remoteStates.some((state) => disabled.includes(state));
  return h.state === null || !disabled.includes(h.state);
}

/** Scores by seeker id, or null when fit is off for the listing. Seekers with no inputs are absent. */
export async function scoreSeekers(
  db: Db,
  h: ListingHiringInfo,
  seekerUserIds: string[],
  today?: string,
): Promise<Map<string, FitResult> | null> {
  if (!(await fitAvailable(db, h))) return null;
  const out = new Map<string, FitResult>();
  if (seekerUserIds.length === 0) return out;
  const inputs = await getFitInputs(db, seekerUserIds);
  const occupations = await listOccupations(db);
  const occupationLabel = occupations.find((o) => o.code === h.occupation)?.label ?? h.title;
  const listing = toFitListing(h, {
    occupationLabel,
    maxPayHourlyCents: toHourlyCents({ pay: h.pay, when: h.when }).maxCents,
    today: today ?? todayInZone(h.timezone, new Date()),
  });
  for (const i of inputs) {
    out.set(i.seekerUserId, computeFit(i, listing, FIT_WEIGHTS, FIT_WEIGHTS_VERSION));
  }
  return out;
}
