// Capacity checks (SP2 spec sections 3, 4 and 8.1): the limit is the sum of valid grants, and
// usage comes from the counter the owning module registers at load (`listing_slot` by
// listings, `seat` by orgs). withCapacity re-counts under the org advisory lock, so two
// concurrent additions can never both take the last free unit.
import type { DbOrTx, Tx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { lockOrg, sumValidGrants, type CapacityKind } from './ledger';

export type UsageCounter = (db: DbOrTx, orgId: string) => Promise<number>;

const usageCounters = new Map<CapacityKind, UsageCounter>();

/**
 * Registers how `kind` usage is counted (listings: `listing_slot`; orgs: `seat`). A second
 * registration for the same kind throws.
 */
export function registerUsageCounter(kind: CapacityKind, count: UsageCounter): void {
  if (usageCounters.has(kind)) throw new Error(`A usage counter for ${kind} is already registered`);
  usageCounters.set(kind, count);
}

/**
 * `limit`: the sum of grants of `kind` valid at `now` (for `seat`, at least 1, because the
 * Owner always counts). `used`: the registered counter.
 */
export async function getCapacity(
  db: DbOrTx,
  orgId: string,
  kind: CapacityKind,
  now: Date = new Date(),
): Promise<{ limit: number; used: number }> {
  const count = usageCounters.get(kind);
  if (!count) throw new Error(`No usage counter for ${kind}`);
  const granted = await sumValidGrants(db, orgId, kind, now);
  const limit = kind === 'seat' ? Math.max(1, granted) : granted;
  const used = await count(db, orgId);
  return { limit, used };
}

/**
 * Takes the org lock, re-counts usage and, when `adding > 0` and `used + adding > limit`, throws
 * conflict `{ reason: 'listing_slot_limit' | 'seat_limit', limit, used }`. Otherwise runs `fn`
 * (still under the lock, which is held until `tx` ends) and returns its result.
 */
export async function withCapacity<T>(
  tx: Tx,
  orgId: string,
  kind: CapacityKind,
  adding: number,
  fn: () => Promise<T>,
): Promise<T> {
  await lockOrg(tx, orgId);
  const { limit, used } = await getCapacity(tx, orgId, kind);
  if (adding > 0 && used + adding > limit) {
    throw conflict('No free capacity', {
      reason: kind === 'listing_slot' ? 'listing_slot_limit' : 'seat_limit',
      limit,
      used,
    });
  }
  return fn();
}
