// Fit scoring with the legal switches (SP5 spec 8.3, plan Task 13). Reads only: the settings,
// SP4's FitInputs and the listing. Callers store the results (`fit-store.ts`, the pool refresh).
//
// The switches are the automated hiring tools controls (issue 116, SP8 `legal.fit_score`):
// `hiring.fit_enabled = false` turns fit off everywhere, and `hiring.fit_disabled_states` turns
// it off for listings located in those states. A Remote listing counts as located in every state
// it hires from (plan decision 13), so `all_us` is off whenever any state is disabled.
//
// The state list also turns fit off for a seeker who lives in one of those states, wherever the
// listing is (lead decision 2026-11-18, issue 198, the cautious reading of spec 8.3 while counsel
// answers SP5 open item 2: the laws the gate names can turn on where the candidate lives). Such a
// seeker is not scored, and a score stored before is neither shown nor ranked (applicants and
// pools). Where a seeker lives is FitInputs' `region` while `countryCode` is US. A seeker with no
// US state on the profile (none given, or outside the US) is unknown, and only the listing rule
// applies to them. The switch only turns fit off: no factor reads `region` for an on-site listing.
import type { Db } from '@/lib/db';
import type { FitResult } from '@/lib/hiring';
import { todayInZone } from '@/lib/hiring';
import type { FitInputs } from '@/lib/profiles';
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

/** The states `hiring.fit_disabled_states` lists. */
export async function fitDisabledStates(db: Db): Promise<readonly string[]> {
  return getSetting(db, 'hiring.fit_disabled_states');
}

/** The US state the seeker lives in, or null when that is unknown or outside the US. */
export function homeState(i: Pick<FitInputs, 'region' | 'countryCode'>): string | null {
  if (i.countryCode.trim().toUpperCase() !== 'US' || i.region === null) return null;
  const state = i.region.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

/** Whether the seeker lives in a disabled state. An unknown home never turns fit off. */
export function livesInDisabledState(
  i: Pick<FitInputs, 'region' | 'countryCode'>,
  disabled: readonly string[],
): boolean {
  const state = homeState(i);
  return state !== null && disabled.includes(state);
}

/**
 * The seekers among `seekerUserIds` who live in one of `disabled`, so fit is off for them. Reads
 * SP4's FitInputs only when a state is disabled.
 */
export async function seekersInDisabledStates(
  db: Db,
  seekerUserIds: readonly string[],
  disabled: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(seekerUserIds)];
  if (disabled.length === 0 || ids.length === 0) return new Set();
  const inputs = await getFitInputs(db, ids);
  return new Set(inputs.filter((i) => livesInDisabledState(i, disabled)).map((i) => i.seekerUserId));
}

/**
 * Scores by seeker id, or null when fit is off for the listing. Seekers with no inputs, and
 * seekers who live in a disabled state, are absent.
 */
export async function scoreSeekers(
  db: Db,
  h: ListingHiringInfo,
  seekerUserIds: string[],
  today?: string,
): Promise<Map<string, FitResult> | null> {
  if (!(await fitAvailable(db, h))) return null;
  const out = new Map<string, FitResult>();
  if (seekerUserIds.length === 0) return out;
  const disabled = await fitDisabledStates(db);
  const inputs = (await getFitInputs(db, seekerUserIds)).filter(
    (i) => !livesInDisabledState(i, disabled),
  );
  if (inputs.length === 0) return out;
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
