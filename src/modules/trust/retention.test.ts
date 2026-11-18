import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { retentionRules } from './index';

const NOW = new Date('2026-11-03T17:00:00.000Z');
/** Exactly 12 calendar months before NOW. */
const LIMIT = new Date('2025-11-03T17:00:00.000Z');
const before = (ms: number) => new Date(LIMIT.getTime() - ms);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.business_verifications`);
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.trust_checks`);
});

async function seedCheck(createdAt: Date): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.trust_checks (id, kind, subject_type, subject_id, provider, model,
      prompt_version, reason, decision, latency_ms, created_at)
    values (${id}, 'text_safety', 'listing', ${newId()}, 'stub', 'stub', 'v1', 'ok', 'approved',
      5, ${createdAt.toISOString()}::timestamptz)
  `);
  return id;
}

async function seedItem(checkId: string, status: 'open' | 'resolved'): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.review_items (id, queue, status, subject_type, subject_id, check_id, reason,
      sla_due_at, resolution, resolved_at)
    values (${id}, 'moderation', ${status}, 'listing', ${newId()}, ${checkId}, 'flagged',
      ${NOW.toISOString()}::timestamptz,
      ${status === 'resolved' ? 'approve' : null},
      ${status === 'resolved' ? NOW.toISOString() : null}::timestamptz)
  `);
  return id;
}

async function checks(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(t.db, sql`select id from app.trust_checks`);
  return rows.map((row) => row.id).sort();
}

const [rule] = retentionRules;
if (!rule) throw new Error('trust registers no retention rule');

describe('trust.checks_12m', () => {
  it('is the only trust rule, with the exact description', () => {
    expect(retentionRules.map((r) => r.key)).toEqual(['trust.checks_12m']);
    expect(rule.description).toBe(
      'Records of automatic safety checks are deleted after 12 months.',
    );
  });

  it('keeps a check exactly 12 months old and deletes one 1 ms older', async () => {
    const atLimit = await seedCheck(LIMIT);
    await seedCheck(before(1));

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await checks()).toEqual([atLimit]);
  });

  it('deletes at most `limit` rows', async () => {
    for (let i = 0; i < 3; i++) await seedCheck(before(1000 + i));

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await checks()).toHaveLength(1);
  });

  it('keeps an old check that an unresolved review item still references', async () => {
    const held = await seedCheck(before(5000));
    await seedItem(held, 'open');

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await checks()).toEqual([held]);
  });

  it('deletes an old check whose review item is resolved, and keeps the item', async () => {
    const done = await seedCheck(before(5000));
    const itemId = await seedItem(done, 'resolved');

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await checks()).toEqual([]);
    const [item] = await queryRows<{ check_id: string | null; reason: string }>(
      t.db,
      sql`select check_id, reason from app.review_items where id = ${itemId}`,
    );
    expect(item).toEqual({ check_id: null, reason: 'flagged' });
  });

  it("keeps an old check another module's row still points at", async () => {
    const referenced = await seedCheck(before(5000));
    const unreferenced = await seedCheck(before(5000));
    const orgId = newId();
    await t.db.execute(
      sql`insert into app.organizations (id, clerk_org_id, name, slug)
          values (${orgId}, ${orgId}, 'Org', ${orgId})`,
    );
    await t.db.execute(sql`
      insert into app.business_verifications (id, org_id, check_id)
      values (${newId()}, ${orgId}, ${referenced})
    `);

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await checks()).toEqual([referenced]);
    expect(await checks()).not.toContain(unreferenced);
  });
});
