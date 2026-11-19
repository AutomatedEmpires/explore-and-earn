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

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.webhook_events`);
});

async function seed(receivedAt: Date): Promise<string> {
  const id = `evt_${newId()}`;
  await t.db.execute(sql`
    insert into app.webhook_events (id, source, received_at)
    values (${id}, 'clerk', ${receivedAt.toISOString()}::timestamptz)
  `);
  return id;
}

async function remaining(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(t.db, sql`select id from app.webhook_events`);
  return rows.map((row) => row.id);
}

const [rule] = retentionRules;
if (!rule) throw new Error('identity registers no retention rule');

describe('identity.webhook_events_30d', () => {
  it('is the only identity rule, with the exact description', () => {
    expect(retentionRules.map((r) => r.key)).toEqual(['identity.webhook_events_30d']);
    expect(rule.description).toBe(
      'Records of messages from our sign-in and payment providers are deleted after 30 days.',
    );
  });

  it('keeps an event received exactly 30 days ago and deletes one 1 ms older', async () => {
    const atLimit = await seed(daysAgo(30));
    await seed(daysAgo(30, 1));

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual([atLimit]);
  });

  it('deletes at most `limit` rows', async () => {
    for (let i = 0; i < 3; i++) await seed(daysAgo(31));

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await remaining()).toHaveLength(1);
  });
});
