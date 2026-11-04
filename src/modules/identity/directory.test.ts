// identity's lookups for other modules (app.users and app.operators stay behind this module).
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { getUserContact, listActiveOperators, markOperatorAssigned } from './index';
import { operators, users } from './schema';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`truncate app.operators, app.users cascade`);
});

async function addOperator(
  o: { role?: 'owner' | 'operator'; queues?: string[]; onShift?: boolean; deleted?: boolean } = {},
): Promise<string> {
  const id = newId();
  await t.db.insert(users).values({
    id,
    clerkUserId: `user_${id}`,
    email: `${id}@ops.test`,
    displayName: `Op ${id.slice(-4)}`,
    accountType: 'operator',
    deletedAt: o.deleted ? new Date() : null,
  });
  await t.db.insert(operators).values({
    userId: id,
    role: o.role ?? 'operator',
    queues: o.queues ?? [],
    shiftStatus: o.onShift === false ? 'away' : 'on_shift',
  });
  return id;
}

describe('getUserContact', () => {
  it('returns the address and whether the account is deleted, or null', async () => {
    const live = await addOperator();
    const gone = await addOperator({ deleted: true });

    expect(await getUserContact(t.db, live)).toMatchObject({
      id: live,
      email: `${live}@ops.test`,
      accountType: 'operator',
      deleted: false,
    });
    expect(await getUserContact(t.db, gone)).toMatchObject({ id: gone, deleted: true });
    expect(await getUserContact(t.db, newId())).toBeNull();
    expect(await getUserContact(t.db, 'not-a-uuid')).toBeNull();
  });
});

describe('listActiveOperators', () => {
  it('filters by queue (Owners cover all), shift, role, ids and exclusions, never deleted ones', async () => {
    const owner = await addOperator({ role: 'owner' });
    const fraud = await addOperator({ queues: ['fraud'] });
    const away = await addOperator({ queues: ['fraud'], onShift: false });
    await addOperator({ queues: ['fraud'], deleted: true });
    const ids = (ops: { userId: string }[]) => ops.map((o) => o.userId).sort();

    expect(ids(await listActiveOperators(t.db))).toEqual([owner, fraud, away].sort());
    expect(ids(await listActiveOperators(t.db, { queue: 'fraud', onShift: true }))).toEqual(
      [owner, fraud].sort(),
    );
    expect(ids(await listActiveOperators(t.db, { queue: 'billing' }))).toEqual([owner]);
    expect(ids(await listActiveOperators(t.db, { role: 'owner' }))).toEqual([owner]);
    expect(ids(await listActiveOperators(t.db, { ids: [fraud, 'junk'] }))).toEqual([fraud]);
    expect(await listActiveOperators(t.db, { ids: [] })).toEqual([]);
    expect(
      ids(await listActiveOperators(t.db, { queue: 'fraud', exclude: [owner, null, 'junk'] })),
    ).toEqual([fraud, away].sort());
  });
});

describe('markOperatorAssigned', () => {
  it("stamps the operator's last assignment", async () => {
    const op = await addOperator();
    const at = new Date('2026-11-03T10:00:00.000Z');
    await markOperatorAssigned(t.db, op, at);
    const [row] = await t.db
      .select({ at: operators.lastAssignedAt })
      .from(operators)
      .where(eq(operators.userId, op));
    expect(row?.at?.toISOString()).toBe(at.toISOString());
    const [listed] = await listActiveOperators(t.db, { ids: [op] });
    expect(listed?.lastAssignedAt?.toISOString()).toBe(at.toISOString());
  });
});
