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
  await t.db.execute(sql`delete from app.outbox`);
});

async function seed(status: string, updatedAt: Date): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.outbox (id, topic, payload, status, created_at, updated_at)
    values (${id}, 'test.topic', '{}'::jsonb, ${status},
      ${updatedAt.toISOString()}::timestamptz, ${updatedAt.toISOString()}::timestamptz)
  `);
  return id;
}

async function remaining(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(t.db, sql`select id from app.outbox`);
  return rows.map((row) => row.id).sort();
}

function rule(key: string) {
  const found = retentionRules.find((r) => r.key === key);
  if (!found) throw new Error(`no rule ${key}`);
  return found;
}

describe('jobs.outbox_done_30d', () => {
  it('uses the exact description', () => {
    expect(rule('jobs.outbox_done_30d').description).toBe(
      'Records of finished background jobs are deleted after 30 days.',
    );
  });

  it('keeps a done row exactly 30 days old and deletes one 1 ms older', async () => {
    const atLimit = await seed('done', daysAgo(30));
    await seed('done', daysAgo(30, 1));

    expect(await rule('jobs.outbox_done_30d').run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual([atLimit]);
  });

  it('deletes at most `limit` rows', async () => {
    for (let i = 0; i < 3; i++) await seed('done', daysAgo(31));

    expect(await rule('jobs.outbox_done_30d').run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await remaining()).toHaveLength(1);
  });

  it('leaves pending, processing and dead rows alone', async () => {
    const kept = [
      await seed('pending', daysAgo(60)),
      await seed('processing', daysAgo(60)),
      await seed('dead', daysAgo(60)),
    ].sort();

    expect(await rule('jobs.outbox_done_30d').run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await remaining()).toEqual(kept);
  });
});

describe('jobs.outbox_dead_90d', () => {
  it('uses the exact description', () => {
    expect(rule('jobs.outbox_dead_90d').description).toBe(
      'Records of failed background jobs are deleted after 90 days.',
    );
  });

  it('keeps a dead row exactly 90 days old and deletes one 1 ms older', async () => {
    const atLimit = await seed('dead', daysAgo(90));
    await seed('dead', daysAgo(90, 1));

    expect(await rule('jobs.outbox_dead_90d').run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual([atLimit]);
  });

  it('deletes at most `limit` rows and never a done row', async () => {
    for (let i = 0; i < 3; i++) await seed('dead', daysAgo(91));
    const done = await seed('done', daysAgo(91));

    expect(await rule('jobs.outbox_dead_90d').run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    const left = await remaining();
    expect(left).toHaveLength(2);
    expect(left).toContain(done);
  });
});
