// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`).
// PGlite has a single connection, so only a real server shows two operators truly racing.
import { inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { approveSecond, claim, decide } from './actions';
import { reviewActions, reviewItems, reviewNotes } from './schema';
import { registerSubjectHandlers } from './subjects';
import { addOperator } from './test-fixtures';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

const SUBJECT = 'int_trust';
const operatorIds: string[] = [];
const itemIds: string[] = [];
const applied: string[] = [];

registerSubjectHandlers(SUBJECT, {
  ban: async (_db, subjectId) => {
    applied.push(subjectId);
  },
});

async function operator(): Promise<string> {
  // Away, so no other test's routing hands them work.
  const id = await addOperator(db, { queues: ['moderation'], shift: 'away' });
  operatorIds.push(id);
  return id;
}

/** An unassigned moderation item (inserted directly, so routing can't assign it). */
async function unassignedItem(): Promise<string> {
  const id = newId();
  await db.insert(reviewItems).values({
    id,
    queue: 'moderation',
    status: 'open',
    subjectType: SUBJECT,
    subjectId: newId(),
    reason: 'integration test',
    slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  itemIds.push(id);
  return id;
}

afterAll(async () => {
  if (itemIds.length > 0) {
    await db.delete(reviewActions).where(inArray(reviewActions.itemId, itemIds));
    await db.delete(reviewNotes).where(inArray(reviewNotes.itemId, itemIds));
    await db.delete(reviewItems).where(inArray(reviewItems.id, itemIds));
  }
  if (operatorIds.length > 0) {
    const ids = sql.join(
      operatorIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    await db.execute(sql`delete from app.operators where user_id in (${ids})`);
    await db.execute(sql`delete from app.users where id in (${ids})`);
  }
  await closeClient(db);
});

describe('two operators at once', () => {
  it('claim: exactly one wins, every time', async () => {
    const a = await operator();
    const b = await operator();

    for (let round = 0; round < 10; round++) {
      const itemId = await unassignedItem();
      const results = await Promise.allSettled([claim(db, itemId, a), claim(db, itemId, b)]);

      expect(
        results.filter((r) => r.status === 'fulfilled'),
        `round ${round}`,
      ).toHaveLength(1);
      const [failure] = results.filter((r) => r.status === 'rejected');
      expect((failure as PromiseRejectedResult).reason).toMatchObject({ code: 'conflict' });
      const [row] = await queryRows<{ assignee_operator_id: string }>(
        db,
        sql`select assignee_operator_id from app.review_items where id = ${itemId}::uuid`,
      );
      expect([a, b]).toContain(row?.assignee_operator_id);
    }
  });

  it('second sign-off: a pending ban is applied once', async () => {
    const first = await operator();
    const b = await operator();
    const c = await operator();
    const itemId = await unassignedItem();
    await claim(db, itemId, first);
    expect(await decide(db, itemId, first, 'ban')).toEqual({ status: 'pending_second' });
    const [pending] = await queryRows<{ id: string }>(
      db,
      sql`select id from app.review_actions where item_id = ${itemId}::uuid`,
    );
    const actionId = pending?.id ?? '';
    applied.length = 0;

    const results = await Promise.allSettled([
      approveSecond(db, actionId, b),
      approveSecond(db, actionId, c),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(applied).toHaveLength(1);
    const [item] = await queryRows<{ status: string; decided_by: string }>(
      db,
      sql`select status, decided_by from app.review_items where id = ${itemId}::uuid`,
    );
    expect(item).toEqual({ status: 'resolved', decided_by: first });
  });
});
