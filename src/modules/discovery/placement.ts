// The boosted placement hook call (SP3 spec 8.13, plan Task 19). The hook (SP6) gets 120 ms;
// on a timeout, an error or an answer that doesn't fit the contract, the page is the organic
// page and the failure is logged as a warning. Paging always moves forward: an answer must
// consume at least one organic item when there is one.
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  getPlacementHook,
  type BoostPlacementHook,
  type PlacementInput,
  type PlacementOutput,
} from './hooks';

export const PLACEMENT_TIMEOUT_MS = 120;

/** The organic page, as the noop hook would place it. */
function organicPage(i: PlacementInput): PlacementOutput {
  return {
    items: i.organic.map((listingId) => ({ listingId, boostId: null })),
    organicConsumed: i.organic.length,
    state: i.state,
  };
}

function fits(out: unknown, i: PlacementInput): out is PlacementOutput {
  if (typeof out !== 'object' || out === null) return false;
  const o = out as Partial<PlacementOutput>;
  const min = i.organic.length > 0 ? 1 : 0;
  return (
    Array.isArray(o.items) &&
    o.items.every(
      (x) =>
        typeof x === 'object' &&
        x !== null &&
        typeof x.listingId === 'string' &&
        (x.boostId === null || typeof x.boostId === 'string'),
    ) &&
    Number.isInteger(o.organicConsumed) &&
    (o.organicConsumed ?? -1) >= min &&
    (o.organicConsumed ?? Infinity) <= i.organic.length &&
    (o.state === null || typeof o.state === 'string')
  );
}

/** The hook's page, or the organic page when it is slow, fails or breaks the contract. */
export async function placeWithTimeout(
  db: DbOrTx,
  hook: BoostPlacementHook,
  i: PlacementInput,
  timeoutMs = PLACEMENT_TIMEOUT_MS,
): Promise<PlacementOutput> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`placement hook timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    const out: unknown = await Promise.race([hook.place(db, i), timeout]);
    if (!fits(out, i)) throw new Error('placement hook returned an invalid page');
    return out;
  } catch (err) {
    logger.warn('discovery.placement_failed', { surface: i.surface, pageIndex: i.pageIndex, err });
    return organicPage(i);
  } finally {
    clearTimeout(timer);
  }
}

/** placeWithTimeout with the hook src/server/placement-hook.ts exports. */
export async function place(db: DbOrTx, i: PlacementInput): Promise<PlacementOutput> {
  let hook: BoostPlacementHook;
  try {
    hook = await getPlacementHook();
  } catch (err) {
    logger.warn('discovery.placement_failed', { surface: i.surface, pageIndex: i.pageIndex, err });
    return organicPage(i);
  }
  return placeWithTimeout(db, hook, i);
}
