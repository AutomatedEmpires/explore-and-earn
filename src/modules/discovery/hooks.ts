// The two seams other sub-projects fill (SP3 spec 3.1, 8.13 and 8.1):
// - Boosted placement (SP6): src/server/placement-hook.ts exports the hook; it is the noop hook
//   until SP6 replaces that one line. It is loaded by dynamic import because the touchpoint
//   itself imports noopHook from this module (Plan decision 8).
// - The seeker overlay (SP4): applied listings and blocked hosts. With no provider, or when the
//   provider fails, nothing is applied or hidden; a failure is logged, never thrown.
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';

/** SP6's proposal (its section 3), adopted verbatim. */
export type PlacementInput = {
  surface: 'seek' | 'swipe';
  pageIndex: number;
  pageSize: number;
  organic: string[];
  /** The ids among `ids` that match this query for this viewer (filters and exclusions). */
  matchIds: (ids: string[]) => Promise<string[]>;
  viewerKey: string;
  /** Opaque to SP3: carried in the cursor (`ps`) from page to page. */
  state: string | null;
  now: Date;
};

export type PlacementOutput = {
  items: { listingId: string; boostId: string | null }[];
  organicConsumed: number;
  state: string | null;
};

export interface BoostPlacementHook {
  place(db: DbOrTx, i: PlacementInput): Promise<PlacementOutput>;
  /** listingId -> boostId for the listings that carry a live boost. */
  boostedAmong(db: DbOrTx, listingIds: string[], now: Date): Promise<Map<string, string>>;
}

/** Organic results in order, nothing boosted. */
export const noopHook: BoostPlacementHook = {
  async place(_db, i) {
    return {
      items: i.organic.map((listingId) => ({ listingId, boostId: null })),
      organicConsumed: i.organic.length,
      state: i.state,
    };
  },
  async boostedAmong() {
    return new Map();
  },
};

let testHook: BoostPlacementHook | null = null;
let loaded: Promise<BoostPlacementHook> | null = null;

/** The hook src/server/placement-hook.ts exports (loaded once), or the test override. */
export async function getPlacementHook(): Promise<BoostPlacementHook> {
  if (testHook) return testHook;
  loaded ??= import('@/server/placement-hook').then((m) => m.boostPlacementHook);
  return loaded;
}

/** Replaces the hook until called again with null. For tests. */
export function setPlacementHookForTests(h: BoostPlacementHook | null): void {
  testHook = h;
}

/** SP4's view of a seeker: what they applied to and which hosts they blocked. */
export interface SeekerOverlayProvider {
  appliedListingIds(db: DbOrTx, userId: string, listingIds: string[] | 'all'): Promise<Set<string>>;
  /** Hosts the seeker blocked. */
  hiddenOrgIds(db: DbOrTx, userId: string): Promise<string[]>;
}

let overlay: SeekerOverlayProvider | null = null;

/** SP4 calls this at module load. The last registration wins. */
export function registerSeekerOverlay(p: SeekerOverlayProvider): void {
  overlay = p;
}

/** The listings among `ids` (or all of them) the seeker applied to; empty without SP4. */
export async function overlayApplied(
  db: DbOrTx,
  userId: string,
  ids: string[] | 'all',
): Promise<Set<string>> {
  if (!overlay) return new Set();
  try {
    return await overlay.appliedListingIds(db, userId, ids);
  } catch (err) {
    logger.warn('discovery.overlay_failed', { which: 'applied', err });
    return new Set();
  }
}

/** The orgs whose listings the seeker never sees; empty without SP4. */
export async function overlayHidden(db: DbOrTx, userId: string): Promise<string[]> {
  if (!overlay) return [];
  try {
    return await overlay.hiddenOrgIds(db, userId);
  } catch (err) {
    logger.warn('discovery.overlay_failed', { which: 'hidden', err });
    return [];
  }
}

/** Removes the registered overlay. For tests. */
export function resetSeekerOverlayForTests(): void {
  overlay = null;
}
