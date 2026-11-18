import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { retentionRules } from './index';

const NOW = new Date('2026-11-03T17:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY_MS - extraMs);

let t: TestDb;
let userId: string;

beforeAll(async () => {
  t = await createTestDb();
  userId = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`);
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.notification_batches`);
  await t.db.execute(sql`delete from app.notifications`);
});

async function seedNotification(createdAt: Date): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.notifications (id, user_id, type, category, title, body, created_at)
    values (${id}, ${userId}, 'test.type', 'account', 'Title', 'Body',
      ${createdAt.toISOString()}::timestamptz)
  `);
  return id;
}

async function seedBatch(status: 'pending' | 'sent', createdAt: Date): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.notification_batches (id, user_id, batch_key, channel, send_after, status,
      created_at)
    values (${id}, ${userId}, ${`batch:${id}`}, 'email',
      ${createdAt.toISOString()}::timestamptz, ${status}, ${createdAt.toISOString()}::timestamptz)
  `);
  return id;
}

async function ids(table: 'notifications' | 'notification_batches'): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    t.db,
    table === 'notifications'
      ? sql`select id from app.notifications`
      : sql`select id from app.notification_batches`,
  );
  return rows.map((row) => row.id).sort();
}

const [rule] = retentionRules;
if (!rule) throw new Error('notifications registers no retention rule');

describe('notifications.in_app_90d', () => {
  it('is the only notifications rule, with the exact description', () => {
    expect(retentionRules.map((r) => r.key)).toEqual(['notifications.in_app_90d']);
    expect(rule.description).toBe('In-app notifications are deleted after 90 days.');
  });

  it('keeps a notification exactly 90 days old and deletes one 1 ms older', async () => {
    const atLimit = await seedNotification(daysAgo(90));
    await seedNotification(daysAgo(90, 1));

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await ids('notifications')).toEqual([atLimit]);
  });

  it('keeps a sent batch exactly 90 days old and deletes one 1 ms older; pending batches stay', async () => {
    const atLimit = await seedBatch('sent', daysAgo(90));
    await seedBatch('sent', daysAgo(90, 1));
    const pending = await seedBatch('pending', daysAgo(200));

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await ids('notification_batches')).toEqual([atLimit, pending].sort());
  });

  it('deletes at most `limit` rows across both tables', async () => {
    for (let i = 0; i < 3; i++) await seedNotification(daysAgo(91));
    for (let i = 0; i < 2; i++) await seedBatch('sent', daysAgo(91));

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await ids('notifications')).toHaveLength(1);
    expect(await ids('notification_batches')).toHaveLength(2);

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await ids('notifications')).toHaveLength(0);
    expect(await ids('notification_batches')).toHaveLength(1);
  });
});
