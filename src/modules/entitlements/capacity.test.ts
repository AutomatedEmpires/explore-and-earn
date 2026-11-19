import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import type * as CapacityModule from './capacity';
import { endGrant, grant, type Actor, type CapacityKind } from './ledger';

let t: TestDb;
const SYSTEM: Actor = { type: 'system', id: null };
const DAY = 24 * 3_600_000;

/** Usage per `${kind}:${orgId}`, read by the counters registered below. */
const usage = new Map<string, number>();
const setUsed = (orgId: string, kind: CapacityKind, n: number) => usage.set(`${kind}:${orgId}`, n);

/**
 * A fresh copy of the capacity module, so the counters registered here never collide with the
 * ones SP2 modules register when the test helpers load them.
 */
async function freshCapacity(): Promise<typeof CapacityModule> {
  vi.resetModules();
  return import('./capacity');
}

let cap: typeof CapacityModule;

beforeAll(async () => {
  t = await createTestDb();
  cap = await freshCapacity();
  for (const kind of ['listing_slot', 'seat'] as const) {
    cap.registerUsageCounter(kind, async (_db, orgId) => usage.get(`${kind}:${orgId}`) ?? 0);
  }
});

afterAll(async () => {
  await t.close();
});

async function newOrg(): Promise<string> {
  return (await seedHostOrg(t.db)).orgId;
}

async function give(
  orgId: string,
  kind: CapacityKind,
  quantity: number,
  o: { validFrom?: Date; validUntil?: Date | null } = {},
): Promise<string> {
  const { grantId } = await grant(t.db, {
    orgId,
    kind,
    quantity,
    source: 'plan',
    sourceRef: 'sub_test',
    validFrom: o.validFrom ?? new Date(Date.now() - DAY),
    validUntil: o.validUntil ?? null,
    idempotencyKey: `test:${newId()}`,
    actor: SYSTEM,
  });
  return grantId;
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
}

describe('getCapacity', () => {
  it('has 0 listing slots and 1 seat (the Owner) without grants', async () => {
    const orgId = await newOrg();
    expect(await cap.getCapacity(t.db, orgId, 'listing_slot')).toEqual({ limit: 0, used: 0 });
    expect(await cap.getCapacity(t.db, orgId, 'seat')).toEqual({ limit: 1, used: 0 });
  });

  it('sums the valid grants of the kind', async () => {
    const orgId = await newOrg();
    await give(orgId, 'seat', 5);
    expect((await cap.getCapacity(t.db, orgId, 'seat')).limit).toBe(5);

    await give(orgId, 'listing_slot', 10);
    await give(orgId, 'listing_slot', 2);
    expect((await cap.getCapacity(t.db, orgId, 'listing_slot')).limit).toBe(12);
    expect((await cap.getCapacity(t.db, orgId, 'seat')).limit).toBe(5);
  });

  it('ignores ended, expired and future grants, at the `now` given', async () => {
    const orgId = await newOrg();
    const now = new Date();
    const ended = await give(orgId, 'listing_slot', 10);
    await endGrant(t.db, ended, now, SYSTEM);
    await give(orgId, 'listing_slot', 4, { validUntil: new Date(now.getTime() - 1) });
    await give(orgId, 'listing_slot', 6, { validFrom: new Date(now.getTime() + DAY) });
    await give(orgId, 'listing_slot', 2);

    expect((await cap.getCapacity(t.db, orgId, 'listing_slot', now)).limit).toBe(2);
    expect(
      (await cap.getCapacity(t.db, orgId, 'listing_slot', new Date(now.getTime() + 2 * DAY))).limit,
    ).toBe(8);
  });

  it('reads used from the registered counter', async () => {
    const orgId = await newOrg();
    setUsed(orgId, 'listing_slot', 3);
    setUsed(orgId, 'seat', 2);
    expect((await cap.getCapacity(t.db, orgId, 'listing_slot')).used).toBe(3);
    expect((await cap.getCapacity(t.db, orgId, 'seat')).used).toBe(2);
  });

  it('throws for a kind with no usage counter', async () => {
    const orgId = await newOrg();
    const bare = await freshCapacity();
    await expect(bare.getCapacity(t.db, orgId, 'listing_slot')).rejects.toThrow(
      'No usage counter for listing_slot',
    );
  });
});

describe('registerUsageCounter', () => {
  it('throws on a second registration for the same kind', async () => {
    const bare = await freshCapacity();
    bare.registerUsageCounter('seat', async () => 0);
    expect(() => bare.registerUsageCounter('seat', async () => 1)).toThrow(/seat/);
    // Another kind is still free.
    bare.registerUsageCounter('listing_slot', async () => 0);
  });
});

describe('withCapacity', () => {
  it('throws conflict listing_slot_limit when adding does not fit, without running fn', async () => {
    const orgId = await newOrg();
    await give(orgId, 'listing_slot', 2);
    setUsed(orgId, 'listing_slot', 2);
    const fn = vi.fn(async () => 'ran');

    const err = await rejection(
      t.db.transaction((tx) => cap.withCapacity(tx, orgId, 'listing_slot', 1, fn)),
    );
    // The fresh module copy has its own AppError class, so compare the shape, not the class.
    expect(err).toMatchObject({
      name: 'AppError',
      code: 'conflict',
      status: 409,
      message: 'No free capacity',
      details: { reason: 'listing_slot_limit', limit: 2, used: 2 },
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('reports seat_limit for seats', async () => {
    const orgId = await newOrg();
    setUsed(orgId, 'seat', 1);
    const err = await rejection(
      t.db.transaction((tx) => cap.withCapacity(tx, orgId, 'seat', 1, async () => null)),
    );
    expect(err).toMatchObject({
      code: 'conflict',
      details: { reason: 'seat_limit', limit: 1, used: 1 },
    });
  });

  it('runs fn and returns its value when the addition fits', async () => {
    const orgId = await newOrg();
    await give(orgId, 'listing_slot', 2);
    setUsed(orgId, 'listing_slot', 1);
    const result = await t.db.transaction((tx) =>
      cap.withCapacity(tx, orgId, 'listing_slot', 1, async () => 'published'),
    );
    expect(result).toBe('published');
  });

  it('runs fn with adding 0 even when used exceeds the limit', async () => {
    const orgId = await newOrg();
    await give(orgId, 'listing_slot', 2);
    setUsed(orgId, 'listing_slot', 5);
    const result = await t.db.transaction((tx) =>
      cap.withCapacity(tx, orgId, 'listing_slot', 0, async () => 'edited'),
    );
    expect(result).toBe('edited');
  });

  it('holds the org advisory lock while fn runs', async () => {
    const orgId = await newOrg();
    await give(orgId, 'listing_slot', 1);
    setUsed(orgId, 'listing_slot', 0);
    const locks = await t.db.transaction((tx) =>
      cap.withCapacity(tx, orgId, 'listing_slot', 1, async () => {
        const rows = await queryRows<{ n: number }>(
          tx,
          sql`
            select count(*)::int as n from pg_locks
            where locktype = 'advisory' and granted and pid = pg_backend_pid()
          `,
        );
        return rows[0]?.n ?? 0;
      }),
    );
    expect(locks).toBeGreaterThanOrEqual(1);
  });
});
