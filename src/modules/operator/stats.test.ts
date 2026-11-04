import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { newId } from '@/lib/ids';
import { operatorStats } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`update app.review_items set original_item_id = null`);
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.operators`);
  await t.db.execute(sql`delete from app.users`);
});

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = new Date('2026-11-03T12:00:00Z');
const SINCE = new Date(NOW.getTime() - 7 * DAY);

async function addOperator(name: string): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${id}@ops.test`}, ${name}, 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${id}, 'operator', '{moderation,appeals}'::text[], 'on_shift')
  `);
  return id;
}

type Resolved = {
  decidedBy: string;
  resolution: 'approve' | 'remove' | 'ask_info' | 'suspend' | 'ban' | 'refund';
  assignedAt: Date;
  resolvedAt: Date;
  queue?: 'moderation' | 'appeals';
  originalItemId?: string;
};

/** A resolved review item, decided by `decidedBy`. */
async function resolvedItem(i: Resolved): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.review_items (
      id, queue, status, subject_type, subject_id, reason, sla_due_at,
      assignee_operator_id, assigned_at, decided_by, resolution, resolved_at, original_item_id
    ) values (
      ${id}, ${i.queue ?? 'moderation'}, 'resolved', 'test_item', ${newId()}, 'test',
      ${new Date(i.assignedAt.getTime() + DAY)}::timestamptz,
      ${i.decidedBy}::uuid, ${i.assignedAt}::timestamptz, ${i.decidedBy}::uuid,
      ${i.resolution}, ${i.resolvedAt}::timestamptz, ${i.originalItemId ?? null}::uuid
    )
  `);
  return id;
}

async function openAppeal(originalItemId: string, assignee: string): Promise<void> {
  await t.db.execute(sql`
    insert into app.review_items (
      id, queue, status, subject_type, subject_id, reason, sla_due_at,
      assignee_operator_id, assigned_at, original_item_id
    ) values (
      ${newId()}, 'appeals', 'assigned', 'test_item', ${newId()}, 'appeal',
      ${new Date(NOW.getTime() + DAY)}::timestamptz, ${assignee}::uuid,
      ${NOW}::timestamptz, ${originalItemId}::uuid
    )
  `);
}

const ago = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);

describe('operatorStats', () => {
  it('counts handled items, average handling time and decisions overturned on appeal', async () => {
    const a = await addOperator('Avery');
    const b = await addOperator('Bo');

    // A handled two items since SINCE: 20 and 40 minutes, so 30 on average.
    const removed = await resolvedItem({
      decidedBy: a,
      resolution: 'remove',
      assignedAt: ago(120),
      resolvedAt: ago(100),
    });
    const banned = await resolvedItem({
      decidedBy: a,
      resolution: 'ban',
      assignedAt: ago(90),
      resolvedAt: ago(50),
    });
    // Before SINCE: not counted.
    await resolvedItem({
      decidedBy: a,
      resolution: 'remove',
      assignedAt: new Date(SINCE.getTime() - DAY),
      resolvedAt: new Date(SINCE.getTime() - DAY + 5 * MINUTE),
    });

    // B overturns A's removal on appeal (counted), and upholds A's ban (not counted).
    await resolvedItem({
      decidedBy: b,
      queue: 'appeals',
      resolution: 'approve',
      assignedAt: ago(30),
      resolvedAt: ago(20),
      originalItemId: removed,
    });
    await resolvedItem({
      decidedBy: b,
      queue: 'appeals',
      resolution: 'remove',
      assignedAt: ago(30),
      resolvedAt: ago(10),
      originalItemId: banned,
    });

    // B's own approval, appealed and still open: nothing for A.
    const approvedByB = await resolvedItem({
      decidedBy: b,
      resolution: 'approve',
      assignedAt: ago(60),
      resolvedAt: ago(55),
    });
    await openAppeal(approvedByB, a);

    expect(await operatorStats(t.db, a, SINCE)).toEqual({
      handled: 2,
      avgHandleMinutes: 30,
      overturnedOnAppeal: 1,
    });
    const statsB = await operatorStats(t.db, b, SINCE);
    expect(statsB).toMatchObject({ handled: 3, overturnedOnAppeal: 0 });
    expect(statsB.avgHandleMinutes).toBeCloseTo((10 + 20 + 5) / 3, 6);
  });

  it('only overturns removals, suspensions and bans', async () => {
    const a = await addOperator('Avery');
    const b = await addOperator('Bo');
    for (const resolution of ['approve', 'ask_info', 'suspend'] as const) {
      const original = await resolvedItem({
        decidedBy: a,
        resolution,
        assignedAt: ago(60),
        resolvedAt: ago(50),
      });
      await resolvedItem({
        decidedBy: b,
        queue: 'appeals',
        resolution: 'approve',
        assignedAt: ago(40),
        resolvedAt: ago(30),
        originalItemId: original,
      });
    }

    const stats = await operatorStats(t.db, a, SINCE);
    expect(stats.overturnedOnAppeal).toBe(1);
    expect(stats.handled).toBe(3);
  });

  it('reports no average for an operator who handled nothing', async () => {
    const a = await addOperator('Avery');
    expect(await operatorStats(t.db, a, SINCE)).toEqual({
      handled: 0,
      avgHandleMinutes: null,
      overturnedOnAppeal: 0,
    });
  });

  it('returns zeros for an id that is not a UUID', async () => {
    expect(await operatorStats(t.db, 'nope', SINCE)).toEqual({
      handled: 0,
      avgHandleMinutes: null,
      overturnedOnAppeal: 0,
    });
  });
});
