// Public API of the entitlements module: the grants and consumptions ledger and capacity checks
// (SP2 spec sections 3 and 8.1). Owned by W1 (Tasks 9-10). Imports no SP2 module.
import type { DbOrTx, Tx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';
import type { CapacityKind } from './ledger';

export {
  consume,
  endGrant,
  getBalance,
  grant,
  listOpenGrants,
  lockOrg,
  reverse,
  type Actor,
  type CapacityKind,
  type CreditKind,
  type EntitlementKind,
  type GrantSource,
} from './ledger';

export { privacyHandlers } from './privacy';

export type UsageCounter = (db: DbOrTx, orgId: string) => Promise<number>;

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W1)`);
}

export async function getCapacity(
  _db: DbOrTx,
  _orgId: string,
  _kind: CapacityKind,
  _now?: Date,
): Promise<{ limit: number; used: number }> {
  return notImplemented('getCapacity');
}

/**
 * Takes pg_advisory_xact_lock(org), re-counts usage and throws
 * conflict {reason:'listing_slot_limit'|'seat_limit', limit, used} when `adding` doesn't fit.
 */
export async function withCapacity<T>(
  _tx: Tx,
  _orgId: string,
  _kind: CapacityKind,
  _adding: number,
  _fn: () => Promise<T>,
): Promise<T> {
  return notImplemented('withCapacity');
}

const usageCounters = new Map<CapacityKind, UsageCounter>();

/** Registers how `kind` usage is counted (listings: `listing_slot`; orgs: `seat`). */
export function registerUsageCounter(kind: CapacityKind, count: UsageCounter): void {
  usageCounters.set(kind, count);
}

/** Entitlements owns no outbox topics. */
export const jobHandlers: HandlerMap = {};
