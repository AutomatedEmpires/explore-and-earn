// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`).
// PGlite has a single connection, so only a real server can show two workers racing.
// Review Focus 2: the cron tick and a post-commit kick run the worker at the same time.
import { like, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { enqueue } from './outbox';
import { enqueueDueSchedules } from './schedule';
import { outbox } from './schema';
import { runWorker, type HandlerMap } from './worker';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  await db.delete(outbox).where(like(outbox.topic, 'int.%'));
  await db.execute(sql`delete from app.schedule_runs where topic like 'int.%'`);
});

afterAll(async () => {
  await db.delete(outbox).where(like(outbox.topic, 'int.%'));
  await db.execute(sql`delete from app.schedule_runs where topic like 'int.%'`);
  await closeClient(db);
});

describe('two workers at once', () => {
  it('handle each of 10 events exactly once', async () => {
    const topic = `int.worker.${newId()}`;
    const ids: string[] = [];
    for (let n = 0; n < 10; n++) {
      const id = `e${n}`;
      ids.push(id);
      await enqueue(db, { topic, payload: { id }, availableAt: new Date(Date.now() - 1000) });
    }

    const calls = new Map<string, number>();
    const handlers: HandlerMap = {
      [topic]: async (payload) => {
        const { id } = payload as { id: string };
        calls.set(id, (calls.get(id) ?? 0) + 1);
        // Hold the batch long enough for the other worker to try to claim the same rows.
        await sleep(30);
      },
    };

    const [a, b] = await Promise.all([
      runWorker(db, { handlers, batchSize: 3 }),
      runWorker(db, { handlers, batchSize: 3 }),
    ]);

    expect(a.processed + b.processed).toBe(10);
    expect(a.retried + b.retried + a.dead + b.dead).toBe(0);
    expect([...calls.keys()].sort()).toEqual([...ids].sort());
    for (const id of ids) expect(calls.get(id), id).toBe(1);

    const statuses = await queryRows<{ status: string; n: number }>(
      db,
      sql`select status, count(*)::int as n from app.outbox where topic = ${topic} group by status`,
    );
    expect(statuses).toEqual([{ status: 'done', n: 10 }]);
  });

  it('enqueue a due schedule once', async () => {
    const topic = `int.schedule.${newId()}`;
    const list = [{ topic, cron: '*/5 * * * *' }];
    const now = new Date();

    const results = await Promise.all([
      enqueueDueSchedules(db, now, list),
      enqueueDueSchedules(db, now, list),
      enqueueDueSchedules(db, now, list),
    ]);

    expect(results.flat()).toEqual([topic]);
    const rows = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.outbox where topic = ${topic}`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
