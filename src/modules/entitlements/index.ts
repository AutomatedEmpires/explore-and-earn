// Public API of the entitlements module: the grants and consumptions ledger and capacity checks
// (SP2 spec sections 3 and 8.1). W0 contract: typed stubs that W1 (Tasks 9-10) replaces.
// Imports no SP2 module.
import type { DbOrTx, Tx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

/** SP6 extends the CHECK constraint and this union. */
export type EntitlementKind = 'listing_slot' | 'seat' | 'invite_credit';
export type CapacityKind = 'listing_slot' | 'seat';
export type CreditKind = 'invite_credit';
export type GrantSource = 'plan' | 'operator' | 'pack' | 'addon';
export type Actor = { type: 'user' | 'operator' | 'system'; id: string | null };

export type UsageCounter = (db: DbOrTx, orgId: string) => Promise<number>;

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W1)`);
}

export async function grant(
  _db: DbOrTx,
  _i: {
    orgId: string;
    kind: EntitlementKind;
    quantity: number;
    source: GrantSource;
    sourceRef: string;
    validFrom?: Date;
    validUntil?: Date | null;
    idempotencyKey: string;
    actor: Actor;
    reason?: string;
  },
): Promise<{ grantId: string; created: boolean }> {
  return notImplemented('grant');
}

export async function endGrant(
  _db: DbOrTx,
  _grantId: string,
  _at: Date,
  _actor: Actor,
): Promise<void> {
  return notImplemented('endGrant');
}

export async function consume(
  _db: DbOrTx,
  _i: {
    orgId: string;
    kind: CreditKind;
    quantity?: number;
    subjectType: string;
    subjectId: string;
    idempotencyKey: string;
    actor: Actor;
  },
): Promise<
  | { ok: true; consumptionId: string; remaining: number }
  | { ok: false; reason: 'insufficient'; remaining: number }
> {
  return notImplemented('consume');
}

export async function reverse(
  _db: DbOrTx,
  _consumptionId: string,
  _reason: string,
  _actor: Actor,
): Promise<void> {
  return notImplemented('reverse');
}

export async function getBalance(
  _db: DbOrTx,
  _orgId: string,
  _kind: CreditKind,
  _now?: Date,
): Promise<{ balance: number; resetsAt: Date | null }> {
  return notImplemented('getBalance');
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

/** The org advisory lock: `pg_advisory_xact_lock(hashtextextended('org:' || orgId, 0))`. */
export async function lockOrg(_tx: Tx, _orgId: string): Promise<void> {
  return notImplemented('lockOrg');
}

/** Grants valid at `now`, filtered by source and kind. */
export async function listOpenGrants(
  _db: DbOrTx,
  _orgId: string,
  _i: { source?: GrantSource; kind?: EntitlementKind },
  _now?: Date,
): Promise<
  {
    id: string;
    kind: EntitlementKind;
    quantity: number;
    sourceRef: string;
    validUntil: Date | null;
  }[]
> {
  return notImplemented('listOpenGrants');
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

/** Entitlements owns no outbox topics. */
export const jobHandlers: HandlerMap = {};
