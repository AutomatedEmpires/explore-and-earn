import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOperator, seedSeeker } from '@tests/helpers/sp8';
import { listPrivacyRequestsForConsole } from './requests';
import { watchRequests } from './watch';

const NOW = new Date('2026-11-18T12:00:00Z');
const MINUTE = 60_000;
const WEEK = 7 * 24 * 60 * MINUTE;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await seedOperator(t.db, { role: 'owner' });
});

afterAll(async () => {
  await t.close();
});

async function seedRequest(o: { createdAt: Date; status?: string; kind?: string }): Promise<string> {
  const userId = (await seedSeeker(t.db)).userId;
  const id = newId();
  await t.db.execute(sql`
    insert into app.privacy_requests (id, user_id, kind, status, created_at)
    values (${id}, ${userId}, ${o.kind ?? 'delete'}, ${o.status ?? 'running'},
      ${o.createdAt.toISOString()}::timestamptz)
  `);
  return id;
}

const row = async (id: string) =>
  (
    await queryRows<{ blocked_reason: string | null; review_item_id: string | null }>(
      t.db,
      sql`select blocked_reason, review_item_id::text from app.privacy_requests where id = ${id}`,
    )
  )[0];

describe('privacy.request_watch', () => {
  it('flags a request open for more than 7 days, once, with an item and an alert', async () => {
    const overdue = await seedRequest({ createdAt: new Date(NOW.getTime() - WEEK - MINUTE) });
    const recent = await seedRequest({ createdAt: new Date(NOW.getTime() - WEEK + MINUTE) });
    const finished = await seedRequest({
      createdAt: new Date(NOW.getTime() - 2 * WEEK),
      status: 'completed',
      kind: 'export',
    });

    expect(await watchRequests(t.db, NOW)).toEqual({ flagged: 1 });
    expect(await watchRequests(t.db, NOW)).toEqual({ flagged: 0 });

    const flagged = await row(overdue);
    expect(flagged?.blocked_reason).toBe('overdue');
    expect(await row(recent)).toEqual({ blocked_reason: null, review_item_id: null });
    expect(await row(finished)).toEqual({ blocked_reason: null, review_item_id: null });

    const items = await queryRows<{ id: string; queue: string; priority: number; reason: string }>(
      t.db,
      sql`select id::text, queue, priority, reason from app.review_items
          where subject_type = 'privacy_request' and subject_id = ${overdue}`,
    );
    expect(items).toEqual([
      {
        id: flagged?.review_item_id,
        queue: 'support',
        priority: 150,
        reason: 'Privacy request needs attention: delete, open for 7 days',
      },
    ]);
    const alerts = await queryRows<{ data: { severity: string; kind: string; message: string } }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'trust.alert' and subject_id = ${flagged?.review_item_id ?? ''}`,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.data).toMatchObject({
      severity: 'warning',
      kind: 'privacy_overdue',
      message: 'A privacy request has been open for 7 days.',
    });

    const exceptions = await listPrivacyRequestsForConsole(t.db, { tab: 'exceptions' });
    expect(exceptions.items.map((item) => item.id)).toEqual([overdue]);
    expect(exceptions.items[0]).toMatchObject({
      kind: 'delete',
      status: 'running',
      blockedReason: 'overdue',
      reviewItemId: flagged?.review_item_id,
      failedSteps: [],
    });
    const all = await listPrivacyRequestsForConsole(t.db, { tab: 'requests' });
    expect(all.items.map((item) => item.id)).toEqual([finished, recent, overdue].sort().reverse());
    expect(all.nextBefore).toBeNull();
  });
});
