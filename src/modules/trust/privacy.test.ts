import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator, seedSeeker } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  operatorId = (await seedOperator(t.db)).userId;
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

async function seedItem(o: {
  subjectType: string;
  subjectId: string;
  resolvedAt?: string;
  note?: string;
}): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.review_items (id, queue, status, subject_type, subject_id, reason, sla_due_at,
      resolution, resolved_at, decided_by)
    values (${id}, 'reports', ${o.resolvedAt ? 'resolved' : 'open'}, ${o.subjectType},
      ${o.subjectId}, 'Reported by a host', now() + interval '1 day',
      ${o.resolvedAt ? 'approve' : null}, ${o.resolvedAt ?? null}::timestamptz,
      ${o.resolvedAt ? operatorId : null})
  `);
  if (o.note) {
    await t.db.execute(sql`
      insert into app.review_notes (id, item_id, author_operator_id, body)
      values (${newId()}, ${id}, ${operatorId}, ${o.note})
    `);
  }
  return id;
}

const itemCount = async () =>
  (await queryRows<{ n: number }>(t.db, sql`select count(*)::int as n from app.review_items`))[0]?.n;

describe('trust privacy handler', () => {
  it('erases nothing and keeps safety records 12 months after the last resolution', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await seedItem({ subjectType: 'user', subjectId: seeker.userId, resolvedAt: '2025-06-01T08:00:00Z' });
    await seedItem({
      subjectType: 'user',
      subjectId: seeker.userId,
      resolvedAt: '2026-01-10T08:00:00Z',
      note: 'Operator-only note',
    });
    await seedItem({ subjectType: 'user', subjectId: other.userId });
    const before = await itemCount();
    const subject = { kind: 'user' as const, userId: seeker.userId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 0,
      retained: [
        { table: 'review_items', reason: 'safety', until: '2027-01-10' },
        { table: 'review_notes', reason: 'safety', until: '2027-01-10' },
      ],
    });
    expect(await erase(subject)).toEqual(first);
    expect(await itemCount()).toBe(before);
  });

  it('gives no end date while an item about the person is open', async () => {
    const seeker = await seedSeeker(t.db);
    await seedItem({ subjectType: 'user', subjectId: seeker.userId, resolvedAt: '2026-01-10T08:00:00Z' });
    await seedItem({ subjectType: 'user', subjectId: seeker.userId });
    expect(await erase({ kind: 'user', userId: seeker.userId })).toEqual({
      erased: 0,
      retained: [{ table: 'review_items', reason: 'safety', until: null }],
    });
  });

  it('reports a legal hold under a hold on everything, and nothing when there are no records', async () => {
    const seeker = await seedSeeker(t.db);
    const clean = await seedSeeker(t.db);
    await seedItem({ subjectType: 'user', subjectId: seeker.userId, resolvedAt: '2026-01-10T08:00:00Z' });
    expect(await erase({ kind: 'user', userId: seeker.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'review_items', reason: 'legal_hold', until: null }],
    });
    expect(await erase({ kind: 'user', userId: clean.userId })).toEqual({ erased: 0, retained: [] });
  });

  it('treats an organization the same way, by its own items', async () => {
    const org = await seedHostOrg(t.db);
    await seedItem({ subjectType: 'organization', subjectId: org.orgId, resolvedAt: '2026-03-31T08:00:00Z' });
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({
      erased: 0,
      retained: [{ table: 'review_items', reason: 'safety', until: '2027-03-31' }],
    });
    // The Owner is a different subject.
    expect(await erase({ kind: 'user', userId: org.owner.userId })).toEqual({
      erased: 0,
      retained: [],
    });
  });

  it('exports resolved decisions about the person, never the notes', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await seedItem({
      subjectType: 'user',
      subjectId: seeker.userId,
      resolvedAt: '2026-01-10T08:00:00Z',
      note: 'Operator-only note',
    });
    await seedItem({ subjectType: 'user', subjectId: seeker.userId });
    await seedItem({ subjectType: 'user', subjectId: other.userId, resolvedAt: '2026-02-01T08:00:00Z' });

    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId });
    expect(part.records.decisions).toEqual([
      { queue: 'reports', resolution: 'approve', resolvedAt: new Date('2026-01-10T08:00:00Z') },
    ]);
    expect(JSON.stringify(part)).not.toContain('Operator-only');
  });
});
