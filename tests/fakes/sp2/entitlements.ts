// An in-memory entitlements ledger with the real semantics (Task 9), for B1 tests that mock
// '@/modules/entitlements':
//
//   vi.mock('@/modules/entitlements', async (orig) => ({
//     ...(await orig()),
//     ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
//   }));
//
// Capacity: `limit` is the setLimit value when set, else the sum of valid grants of that kind
// once the org has ever been granted that kind (ended grants count as granted), else the
// default (listing_slot 10, seat 5). `used` comes from the registered counter when there is
// one, else from setUsed (default 0).
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type {
  CapacityKind,
  EntitlementKind,
  GrantSource,
  UsageCounter,
} from '@/modules/entitlements';

type GrantRow = {
  id: string;
  orgId: string;
  kind: EntitlementKind;
  quantity: number;
  source: GrantSource;
  sourceRef: string;
  validFrom: Date;
  validUntil: Date | null;
  idempotencyKey: string;
};

type ConsumptionRow = {
  id: string;
  orgId: string;
  grantId: string;
  quantity: number;
  idempotencyKey: string;
  baseKey: string;
  reversedAt: Date | null;
};

type ConsumeResult =
  | { ok: true; consumptionId: string; remaining: number }
  | { ok: false; reason: 'insufficient'; remaining: number };

const DEFAULT_LIMIT: Record<CapacityKind, number> = { listing_slot: 10, seat: 5 };

const state = {
  grants: [] as GrantRow[],
  consumptions: [] as ConsumptionRow[],
  results: new Map<string, ConsumeResult>(),
  limits: new Map<string, number>(),
  used: new Map<string, number>(),
  counters: new Map<CapacityKind, UsageCounter>(),
  calls: [] as { name: string; args: unknown[] }[],
};

const key = (orgId: string, kind: string) => `${orgId}:${kind}`;
const log = (name: string, args: unknown[]) => state.calls.push({ name, args });

const isValid = (g: GrantRow, now: Date) =>
  g.validFrom <= now && (g.validUntil === null || now < g.validUntil);

function left(g: GrantRow): number {
  const spent = state.consumptions
    .filter((c) => c.grantId === g.id && c.reversedAt === null)
    .reduce((sum, c) => sum + c.quantity, 0);
  return g.quantity - spent;
}

/** Valid grants with something left, oldest-expiring first (open-ended last). */
function drawable(orgId: string, kind: EntitlementKind, now: Date): GrantRow[] {
  return state.grants
    .filter((g) => g.orgId === orgId && g.kind === kind && isValid(g, now) && left(g) > 0)
    .sort((a, b) => {
      const au = a.validUntil?.getTime() ?? Infinity;
      const bu = b.validUntil?.getTime() ?? Infinity;
      return au - bu || a.validFrom.getTime() - b.validFrom.getTime();
    });
}

async function getCapacity(
  db: unknown,
  orgId: string,
  kind: CapacityKind,
  now: Date = new Date(),
): Promise<{ limit: number; used: number }> {
  log('getCapacity', [orgId, kind, now]);
  let limit = state.limits.get(key(orgId, kind));
  if (limit === undefined) {
    const ever = state.grants.filter((g) => g.orgId === orgId && g.kind === kind);
    limit =
      ever.length > 0
        ? ever.filter((g) => isValid(g, now)).reduce((sum, g) => sum + g.quantity, 0)
        : DEFAULT_LIMIT[kind];
  }
  const counter = state.counters.get(kind);
  const used = counter
    ? await counter(db as never, orgId)
    : (state.used.get(key(orgId, kind)) ?? 0);
  return { limit, used };
}

const fns = {
  async grant(
    _db: unknown,
    i: {
      orgId: string;
      kind: EntitlementKind;
      quantity: number;
      source: GrantSource;
      sourceRef: string;
      validFrom?: Date;
      validUntil?: Date | null;
      idempotencyKey: string;
    },
  ) {
    log('grant', [i]);
    if (!Number.isInteger(i.quantity) || i.quantity <= 0) {
      throw badRequest('quantity must be a positive integer');
    }
    const existing = state.grants.find((g) => g.idempotencyKey === i.idempotencyKey);
    if (existing) return { grantId: existing.id, created: false };
    const row: GrantRow = {
      id: newId(),
      orgId: i.orgId,
      kind: i.kind,
      quantity: i.quantity,
      source: i.source,
      sourceRef: i.sourceRef,
      validFrom: i.validFrom ?? new Date(),
      validUntil: i.validUntil ?? null,
      idempotencyKey: i.idempotencyKey,
    };
    state.grants.push(row);
    return { grantId: row.id, created: true };
  },

  async endGrant(_db: unknown, grantId: string, at: Date) {
    log('endGrant', [grantId, at]);
    const g = state.grants.find((r) => r.id === grantId);
    if (!g) throw notFound('Grant not found');
    if (g.validUntil === null || at < g.validUntil) g.validUntil = at;
  },

  async listOpenGrants(
    _db: unknown,
    orgId: string,
    i: { source?: GrantSource; kind?: EntitlementKind },
    now: Date = new Date(),
  ) {
    log('listOpenGrants', [orgId, i, now]);
    return state.grants
      .filter(
        (g) =>
          g.orgId === orgId &&
          isValid(g, now) &&
          (i.source === undefined || g.source === i.source) &&
          (i.kind === undefined || g.kind === i.kind),
      )
      .map((g) => ({
        id: g.id,
        kind: g.kind,
        quantity: g.quantity,
        sourceRef: g.sourceRef,
        validUntil: g.validUntil,
      }));
  },

  async consume(
    _db: unknown,
    i: { orgId: string; kind: 'invite_credit'; quantity?: number; idempotencyKey: string },
  ): Promise<ConsumeResult> {
    log('consume', [i]);
    const previous = state.results.get(i.idempotencyKey);
    if (previous) return previous;
    const quantity = i.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw badRequest('quantity must be a positive integer');
    }
    const now = new Date();
    const grants = drawable(i.orgId, i.kind, now);
    const total = grants.reduce((sum, g) => sum + left(g), 0);
    if (total < quantity) return { ok: false, reason: 'insufficient', remaining: total };

    let needed = quantity;
    let firstId: string | null = null;
    let n = 1;
    for (const g of grants) {
      if (needed === 0) break;
      const take = Math.min(needed, left(g));
      const id = newId();
      firstId ??= id;
      state.consumptions.push({
        id,
        orgId: i.orgId,
        grantId: g.id,
        quantity: take,
        idempotencyKey: n === 1 ? i.idempotencyKey : `${i.idempotencyKey}#${n}`,
        baseKey: i.idempotencyKey,
        reversedAt: null,
      });
      needed -= take;
      n += 1;
    }
    const result: ConsumeResult = {
      ok: true,
      consumptionId: firstId ?? newId(),
      remaining: total - quantity,
    };
    state.results.set(i.idempotencyKey, result);
    return result;
  },

  async reverse(_db: unknown, consumptionId: string, reason: string) {
    log('reverse', [consumptionId, reason]);
    const row = state.consumptions.find((c) => c.id === consumptionId);
    if (!row) throw notFound('Consumption not found');
    const now = new Date();
    for (const c of state.consumptions) {
      if (c.baseKey === row.baseKey && c.reversedAt === null) c.reversedAt = now;
    }
  },

  async getBalance(_db: unknown, orgId: string, kind: 'invite_credit', now: Date = new Date()) {
    log('getBalance', [orgId, kind, now]);
    const grants = state.grants.filter(
      (g) => g.orgId === orgId && g.kind === kind && isValid(g, now),
    );
    const balance = grants.reduce((sum, g) => sum + left(g), 0);
    const withLeft = grants.filter((g) => left(g) > 0 && g.validUntil !== null);
    const resetsAt =
      withLeft.length > 0
        ? new Date(Math.min(...withLeft.map((g) => (g.validUntil as Date).getTime())))
        : null;
    return { balance, resetsAt };
  },

  getCapacity,

  async withCapacity<T>(
    tx: unknown,
    orgId: string,
    kind: CapacityKind,
    adding: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    log('withCapacity', [orgId, kind, adding]);
    const { limit, used } = await getCapacity(tx, orgId, kind);
    if (adding > 0 && used + adding > limit) {
      throw conflict('No free capacity', {
        reason: kind === 'listing_slot' ? 'listing_slot_limit' : 'seat_limit',
        limit,
        used,
      });
    }
    return fn();
  },

  registerUsageCounter(kind: CapacityKind, count: UsageCounter) {
    log('registerUsageCounter', [kind]);
    state.counters.set(kind, count);
  },

  async lockOrg(_tx: unknown, orgId: string) {
    log('lockOrg', [orgId]);
  },
} satisfies Partial<typeof import('@/modules/entitlements')>;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/entitlements'), keyof typeof fns>;

export const entitlementsFake = Object.assign(fns as Fns, {
  /** Every call, in order (lockOrg included). */
  calls: state.calls,
  /** The grants written so far. */
  grants: state.grants,
  /** Fixes the capacity limit for an org and kind; null clears it. */
  setLimit(orgId: string, kind: CapacityKind, n: number | null) {
    if (n === null) state.limits.delete(key(orgId, kind));
    else state.limits.set(key(orgId, kind), n);
  },
  /** Usage when no counter is registered for the kind. */
  setUsed(orgId: string, kind: CapacityKind, n: number) {
    state.used.set(key(orgId, kind), n);
  },
  /** Clears the ledger, limits, usage and calls. Registered counters are kept. */
  reset() {
    state.grants.length = 0;
    state.consumptions.length = 0;
    state.results.clear();
    state.limits.clear();
    state.used.clear();
    state.calls.length = 0;
  },
});
