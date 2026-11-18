import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-11-18T12:00:00Z');
const TABLES = [
  'notifications',
  'notification_preferences',
  'push_subscriptions',
  'notification_batches',
] as const;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

/** One row in each per-user table, and optionally a suppression of the address. */
async function seedRows(userId: string, email: string | null, suppress: boolean): Promise<void> {
  await t.db.execute(sql`
    insert into app.notifications (id, user_id, type, category, title, body, data)
    values (${newId()}, ${userId}, 'system.test', 'account', 'Welcome', 'Hello there',
      '{"internal":"not exported"}'::jsonb)
  `);
  await t.db.execute(sql`
    insert into app.notification_preferences (user_id, category, channel, enabled)
    values (${userId}, 'jobs', 'email', false)
  `);
  await t.db.execute(sql`
    insert into app.push_subscriptions (id, user_id, endpoint, p256dh, auth)
    values (${newId()}, ${userId}, ${`https://push.example.test/${newId()}`}, 'key', 'auth')
  `);
  await t.db.execute(sql`
    insert into app.notification_batches (id, user_id, batch_key, channel, send_after)
    values (${newId()}, ${userId}, 'digest', 'email', now())
  `);
  if (suppress && email) {
    await t.db.execute(sql`
      insert into app.email_suppressions (email, reason) values (${email}, 'bounce')
    `);
  }
}

async function counts(userId: string): Promise<number[]> {
  const out: number[] = [];
  for (const table of TABLES) {
    const [row] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.${sql.identifier(table)} where user_id = ${userId}`,
    );
    out.push(row?.n ?? 0);
  }
  return out;
}

const suppressed = async (email: string | null) =>
  (await queryRows(t.db, sql`select 1 from app.email_suppressions where email = ${email}`)).length;

describe('notifications privacy handler', () => {
  it('deletes everything addressed to the person and keeps the suppression', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await seedRows(seeker.userId, seeker.user.email, true);
    await seedRows(other.userId, other.user.email, true);
    const subject = { kind: 'user' as const, userId: seeker.userId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 4,
      retained: [{ table: 'email_suppressions', reason: 'legal_obligation', until: null }],
    });
    expect(await counts(seeker.userId)).toEqual([0, 0, 0, 0]);
    expect(await suppressed(seeker.user.email)).toBe(1);
    expect(await counts(other.userId)).toEqual([1, 1, 1, 1]);
    expect(await suppressed(other.user.email)).toBe(1);

    expect(await erase(subject)).toEqual({ erased: 0, retained: first.retained });
  });

  it('reports no suppression when the address was never suppressed', async () => {
    const seeker = await seedSeeker(t.db);
    await seedRows(seeker.userId, seeker.user.email, false);
    expect(await erase({ kind: 'user', userId: seeker.userId })).toEqual({
      erased: 4,
      retained: [],
    });
  });

  it('erases nothing under a hold on everything', async () => {
    const seeker = await seedSeeker(t.db);
    await seedRows(seeker.userId, seeker.user.email, true);
    const held = await erase({ kind: 'user', userId: seeker.userId }, ['all']);
    expect(held.erased).toBe(0);
    expect(held.retained).toEqual([
      { table: 'notifications', reason: 'legal_hold', until: null },
      { table: 'notification_preferences', reason: 'legal_hold', until: null },
      { table: 'push_subscriptions', reason: 'legal_hold', until: null },
      { table: 'notification_batches', reason: 'legal_hold', until: null },
      { table: 'email_suppressions', reason: 'legal_obligation', until: null },
    ]);
    expect(await counts(seeker.userId)).toEqual([1, 1, 1, 1]);
  });

  it('exports preferences and notification text, not the internal data', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await seedRows(seeker.userId, seeker.user.email, false);
    await seedRows(other.userId, other.user.email, false);
    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId });
    expect(part.records.preferences).toEqual([
      { category: 'jobs', channel: 'email', enabled: false },
    ]);
    expect(part.records.notifications).toEqual([
      expect.objectContaining({ title: 'Welcome', body: 'Hello there', readAt: null }),
    ]);
    expect(JSON.stringify(part)).not.toContain('not exported');
    expect(part.files).toEqual([]);
  });

  it('has nothing for an organization', async () => {
    const org = await seedHostOrg(t.db);
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 0, retained: [] });
  });
});
