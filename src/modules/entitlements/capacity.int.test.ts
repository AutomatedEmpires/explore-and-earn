// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`):
// PGlite has one connection, so only a real server can show two transactions racing for the
// last free unit.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import { closeClient, createDb, queryRows, withTx, type Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type * as CapacityModule from './capacity';
import { grant } from './ledger';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

let cap: typeof CapacityModule;

beforeAll(async () => {
  await db.execute(sql`
    create table if not exists app.int_capacity_items (id uuid primary key, org_id uuid not null)
  `);
  // A fresh module copy, so this counter never collides with one an SP2 module registers.
  vi.resetModules();
  cap = await import('./capacity');
  cap.registerUsageCounter('listing_slot', async (d, orgId) => {
    const rows = await queryRows<{ n: number }>(
      d,
      sql`select count(*)::int as n from app.int_capacity_items where org_id = ${orgId}`,
    );
    return rows[0]?.n ?? 0;
  });
});

afterAll(async () => {
  await db.execute(sql`drop table if exists app.int_capacity_items`);
  await closeClient(db);
});

describe('withCapacity under concurrency', () => {
  it('lets exactly one of two concurrent additions take the last free slot', async () => {
    const { orgId } = await seedHostOrg(db);
    await db.execute(sql`
      insert into app.int_capacity_items (id, org_id)
      values (${newId()}, ${orgId}), (${newId()}, ${orgId})
    `);
    await grant(db, {
      orgId,
      kind: 'listing_slot',
      quantity: 3,
      source: 'plan',
      sourceRef: 'sub_int',
      validFrom: new Date(Date.now() - 60_000),
      idempotencyKey: `int:${newId()}`,
      actor: { type: 'system', id: null },
    });
    expect(await cap.getCapacity(db, orgId, 'listing_slot')).toEqual({ limit: 3, used: 2 });

    const insertRow = async (tx: Tx) => {
      // Without the lock, both transactions would count 2 here and both insert.
      await tx.execute(sql`select pg_sleep(0.2)`);
      await tx.execute(sql`
        insert into app.int_capacity_items (id, org_id) values (${newId()}, ${orgId})
      `);
      return 'inserted';
    };
    const attempt = () =>
      withTx(db, (tx) => cap.withCapacity(tx, orgId, 'listing_slot', 1, () => insertRow(tx)));

    const results = await Promise.allSettled([attempt(), attempt()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      name: 'AppError',
      code: 'conflict',
      details: { reason: 'listing_slot_limit', limit: 3, used: 3 },
    });
    const rows = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.int_capacity_items where org_id = ${orgId}`,
    );
    expect(rows[0]?.n).toBe(3);
  });
});
