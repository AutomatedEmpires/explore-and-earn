import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import type { Db } from '@/lib/db';
import { withTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { schedules } from '@/server/schedules';
import { POST } from '@/app/api/jobs/run/route';
import { enqueue, kickWorker } from './outbox';
import { enqueueDueSchedules, lastDueAt } from './schedule';
import { outbox } from './schema';
import { MAX_ATTEMPTS, nextDelayMs, runWorker, type HandlerMap } from './worker';

// The jobs route reads the database through getDb(); point it at this file's PGlite.
const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!dbHolder.current) throw new Error('test db not ready');
      return dbHolder.current;
    },
  };
});

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: sentry.captureMessage,
}));

// Next's after() needs a request scope; tests decide what it does.
const nextServer = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => Promise<void>) => nextServer.after(task),
}));

const T0 = new Date('2026-01-01T10:00:00.000Z');
const minutes = (n: number) => n * 60_000;
const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`delete from app.schedule_runs`);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  nextServer.after.mockReset();
  sentry.captureMessage.mockClear();
});

function rows(topic?: string) {
  const q = t.db.select().from(outbox);
  return (topic ? q.where(eq(outbox.topic, topic)) : q).orderBy(asc(outbox.id));
}

function quiet() {
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  return vi.spyOn(logger, 'error').mockImplementation(() => {});
}

describe('enqueue', () => {
  it('creates one row for two events with the same dedupe key', async () => {
    await enqueue(t.db, { topic: 'a', payload: { n: 1 }, dedupeKey: 'k1' });
    await enqueue(t.db, { topic: 'a', payload: { n: 2 }, dedupeKey: 'k1' });
    const all = await rows('a');
    expect(all).toHaveLength(1);
    expect(all[0]?.payload).toEqual({ n: 1 });
    expect(all[0]?.status).toBe('pending');
    expect(all[0]?.attempts).toBe(0);
  });

  it('creates separate rows without a dedupe key', async () => {
    await enqueue(t.db, { topic: 'a', payload: 1 });
    await enqueue(t.db, { topic: 'a', payload: 2 });
    expect(await rows('a')).toHaveLength(2);
  });

  it('is part of the caller transaction, so a rollback drops the event', async () => {
    await expect(
      withTx(t.db, async (tx) => {
        await enqueue(tx, { topic: 'a', payload: {} });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rows('a')).toHaveLength(0);
  });

  it('stores availableAt and a JSON null payload for undefined', async () => {
    await enqueue(t.db, { topic: 'a', payload: undefined, availableAt: T0 });
    const [row] = await rows('a');
    expect(row?.availableAt.toISOString()).toBe(T0.toISOString());
    expect(row?.payload).toBeNull();
  });
});

describe('nextDelayMs', () => {
  it('starts at 30 seconds and caps at 6 hours', () => {
    expect(nextDelayMs(0, () => 0.5)).toBe(30_000);
    expect(nextDelayMs(1, () => 0.5)).toBe(60_000);
    expect(nextDelayMs(20, () => 0.5)).toBe(21_600_000);
  });

  it('applies at most 20% jitter either way', () => {
    expect(nextDelayMs(0, () => 0)).toBe(24_000);
    expect(nextDelayMs(0, () => 0.999_999)).toBeLessThanOrEqual(36_000);
    expect(nextDelayMs(0, () => 0.999_999)).toBeGreaterThan(35_999);
    for (let i = 0; i < 50; i++) {
      const d = nextDelayMs(3);
      expect(d).toBeGreaterThanOrEqual(0.8 * 240_000);
      expect(d).toBeLessThanOrEqual(1.2 * 240_000);
    }
  });
});

describe('runWorker', () => {
  it('passes the payload to the topic handler and marks the event done', async () => {
    const seen: unknown[] = [];
    const handlers: HandlerMap = {
      greet: async (payload, ctx) => {
        expect(ctx.db).toBe(t.db);
        expect(ctx.now).toEqual(T0);
        seen.push(payload);
      },
    };
    await enqueue(t.db, { topic: 'greet', payload: { name: 'Maya' }, availableAt: T0 });

    const result = await runWorker(t.db, { now: T0, handlers });

    expect(result).toEqual({ processed: 1, retried: 0, dead: 0 });
    expect(seen).toEqual([{ name: 'Maya' }]);
    const [row] = await rows('greet');
    expect(row?.status).toBe('done');
    expect(row?.lockedAt).toBeNull();
  });

  it('leaves events that are not yet available', async () => {
    const handler = vi.fn(async () => {});
    await enqueue(t.db, { topic: 'later', payload: {}, availableAt: at(T0, minutes(5)) });
    const result = await runWorker(t.db, { now: T0, handlers: { later: handler } });
    expect(result).toEqual({ processed: 0, retried: 0, dead: 0 });
    expect(handler).not.toHaveBeenCalled();
    expect((await rows('later'))[0]?.status).toBe('pending');
  });

  it('processes every available event across batches, oldest first', async () => {
    const order: number[] = [];
    for (const n of [3, 1, 4, 2, 5]) {
      await enqueue(t.db, { topic: 'n', payload: n, availableAt: at(T0, -n * 1000) });
    }
    const result = await runWorker(t.db, {
      now: T0,
      batchSize: 2,
      handlers: { n: async (p) => void order.push(p as number) },
    });
    expect(result.processed).toBe(5);
    expect(order).toEqual([5, 4, 3, 2, 1]);
  });

  it('retries a failing handler with backoff, then marks it dead after the 8th failure', async () => {
    const errorSpy = quiet();
    const onDead = vi.fn(async () => {});
    const handlers: HandlerMap = {
      flaky: async () => {
        throw new Error('provider down');
      },
    };
    await enqueue(t.db, { topic: 'flaky', payload: {}, availableAt: T0 });

    const first = await runWorker(t.db, { now: T0, handlers, onDead });
    expect(first).toEqual({ processed: 0, retried: 1, dead: 0 });
    let [row] = await rows('flaky');
    expect(row?.attempts).toBe(1);
    expect(row?.status).toBe('pending');
    expect(row?.lastError).toContain('provider down');
    expect(row?.lockedAt).toBeNull();
    const delay = (row?.availableAt.getTime() ?? 0) - T0.getTime();
    expect(delay).toBeGreaterThanOrEqual(24_000);
    expect(delay).toBeLessThanOrEqual(36_000);
    expect(errorSpy).not.toHaveBeenCalled();

    // Failures 2..7 stay pending; each run happens after the event is available again.
    for (let attempt = 2; attempt < MAX_ATTEMPTS; attempt++) {
      const now = at(row?.availableAt ?? T0, 1);
      expect(await runWorker(t.db, { now, handlers, onDead })).toEqual({
        processed: 0,
        retried: 1,
        dead: 0,
      });
      [row] = await rows('flaky');
      expect(row?.attempts).toBe(attempt);
      expect(row?.status).toBe('pending');
    }
    expect(errorSpy).not.toHaveBeenCalled();
    expect(onDead).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();

    const last = await runWorker(t.db, { now: at(row?.availableAt ?? T0, 1), handlers, onDead });
    expect(last).toEqual({ processed: 0, retried: 0, dead: 1 });
    [row] = await rows('flaky');
    expect(row?.attempts).toBe(MAX_ATTEMPTS);
    expect(row?.status).toBe('dead');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('dead'),
      expect.objectContaining({ topic: 'flaky', attempts: MAX_ATTEMPTS }),
    );

    // Going dead raises the alert: Sentry, and the operator alert hook (in its own transaction).
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDead).toHaveBeenCalledWith(t.db, {
      eventId: row?.id,
      topic: 'flaky',
      attempts: MAX_ATTEMPTS,
      error: 'provider down',
    });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('dead'),
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({ topic: 'flaky', eventId: row?.id }),
      }),
    );

    // A dead event is never picked up again.
    const after = await runWorker(t.db, { now: at(T0, minutes(60 * 24 * 30)), handlers, onDead });
    expect(after).toEqual({ processed: 0, retried: 0, dead: 0 });
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it('retries an event whose topic has no handler', async () => {
    quiet();
    await enqueue(t.db, { topic: 'unknown.topic', payload: {}, availableAt: T0 });
    const result = await runWorker(t.db, { now: T0, handlers: {} });
    expect(result).toEqual({ processed: 0, retried: 1, dead: 0 });
    const [row] = await rows('unknown.topic');
    expect(row?.status).toBe('pending');
    expect(row?.lastError).toContain('No handler');
  });

  it('does not treat inherited object keys as handlers', async () => {
    quiet();
    await enqueue(t.db, { topic: 'constructor', payload: {}, availableAt: T0 });
    const result = await runWorker(t.db, { now: T0, handlers: {} });
    expect(result.retried).toBe(1);
  });

  it('reclaims a processing event locked more than 10 minutes ago', async () => {
    const handler = vi.fn(async () => {});
    await enqueue(t.db, { topic: 'stale', payload: { s: 1 }, availableAt: T0 });
    await enqueue(t.db, { topic: 'fresh', payload: { s: 2 }, availableAt: T0 });
    await t.db.execute(sql`
      update app.outbox set status = 'processing', attempts = 1,
        locked_at = ${at(T0, -minutes(11))}::timestamptz
      where topic = 'stale'`);
    await t.db.execute(sql`
      update app.outbox set status = 'processing', attempts = 1,
        locked_at = ${at(T0, -minutes(5))}::timestamptz
      where topic = 'fresh'`);

    const result = await runWorker(t.db, { now: T0, handlers: { stale: handler, fresh: handler } });

    expect(result).toEqual({ processed: 1, retried: 0, dead: 0 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ s: 1 }, expect.anything());
    expect((await rows('stale'))[0]?.status).toBe('done');
    expect((await rows('fresh'))[0]?.status).toBe('processing');
  });

  it('marks a stale event that already used every attempt as dead', async () => {
    const errorSpy = quiet();
    const handler = vi.fn(async () => {});
    await enqueue(t.db, { topic: 'crashy', payload: {}, availableAt: T0 });
    await t.db.execute(sql`
      update app.outbox set status = 'processing', attempts = ${MAX_ATTEMPTS},
        locked_at = ${at(T0, -minutes(11))}::timestamptz
      where topic = 'crashy'`);

    const onDead = vi.fn(async () => {});
    const result = await runWorker(t.db, { now: T0, handlers: { crashy: handler }, onDead });

    expect(result).toEqual({ processed: 0, retried: 0, dead: 1 });
    expect(handler).not.toHaveBeenCalled();
    const [row] = await rows('crashy');
    expect(row?.status).toBe('dead');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('dead'),
      expect.objectContaining({ topic: 'crashy' }),
    );
    expect(onDead).toHaveBeenCalledWith(t.db, {
      eventId: row?.id,
      topic: 'crashy',
      attempts: MAX_ATTEMPTS,
      error: 'lock expired on the final attempt',
    });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('still marks an event dead when its alert cannot be raised', async () => {
    const errorSpy = quiet();
    await enqueue(t.db, { topic: 'doomed', payload: {}, availableAt: T0 });
    await t.db.execute(sql`update app.outbox set attempts = ${MAX_ATTEMPTS - 1} where topic = 'doomed'`);
    const onDead = vi.fn(async () => {
      throw new Error('alerting is down too');
    });

    const result = await runWorker(t.db, {
      now: T0,
      handlers: { doomed: async () => Promise.reject(new Error('nope')) },
      onDead,
    });

    expect(result).toEqual({ processed: 0, retried: 0, dead: 1 });
    expect((await rows('doomed'))[0]?.status).toBe('dead');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('alert'),
      expect.objectContaining({ topic: 'doomed' }),
    );
  });

  it("never stores or logs a failed query's parameters", async () => {
    quiet();
    const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const email = 'maya.private@example.test';
    const handlers: HandlerMap = {
      insert: async (_p, { db }) => {
        // Drizzle's error message lists the values: the email among them.
        await db.insert(outbox).values({
          id: 'not-a-uuid',
          topic: email,
          payload: {},
        });
      },
    };
    await enqueue(t.db, { topic: 'insert', payload: {}, availableAt: T0 });
    vi.mocked(logger.warn).mockRestore();

    await runWorker(t.db, { now: T0, handlers });

    const [row] = await rows('insert');
    expect(row?.status).toBe('pending');
    expect(row?.lastError).toContain('Failed query: insert into "app"."outbox"');
    expect(row?.lastError).not.toContain(email);
    expect(logged.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(email);
  });

  it('hands back claimed events it has no time left to start, without using an attempt', async () => {
    // A fake wall clock for the time budget: the first handler takes 30 s, past the 25 s budget.
    let clock = Date.parse('2026-01-01T10:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const order: number[] = [];
    const handlers: HandlerMap = {
      slow: async (p) => {
        order.push(p as number);
        clock += 30_000;
      },
    };
    for (const n of [1, 2, 3]) {
      await enqueue(t.db, { topic: 'slow', payload: n, availableAt: at(T0, n - 10) });
    }

    const result = await runWorker(t.db, { now: T0, handlers });

    expect(result).toEqual({ processed: 1, retried: 0, dead: 0 });
    expect(order).toEqual([1]);
    const after = await rows('slow');
    expect(after.map((r) => [r.payload, r.status, r.attempts, r.lockedAt])).toEqual([
      [1, 'done', 1, null],
      [2, 'pending', 0, null],
      [3, 'pending', 0, null],
    ]);

    // The next run starts with them, each on its first attempt.
    clock += 60_000;
    const next = await runWorker(t.db, { now: at(T0, 1000), handlers });
    expect(next.processed).toBeGreaterThanOrEqual(1);
    expect(order[1]).toBe(2);
    expect((await rows('slow')).find((r) => r.payload === 2)?.attempts).toBe(1);
  });

  it('processes events a handler enqueues during the same run when no clock is fixed', async () => {
    const done: string[] = [];
    const handlers: HandlerMap = {
      first: async (_p, ctx) => {
        done.push('first');
        await enqueue(ctx.db, { topic: 'second', payload: {} });
      },
      second: async () => void done.push('second'),
    };
    await enqueue(t.db, { topic: 'first', payload: {} });
    const result = await runWorker(t.db, { handlers });
    expect(result.processed).toBe(2);
    expect(done).toEqual(['first', 'second']);
  });
});

describe('enqueueDueSchedules', () => {
  const list = [{ topic: 't', cron: '*/5 * * * *' }];

  it('enqueues a topic once per due cron time', async () => {
    expect(await enqueueDueSchedules(t.db, new Date('2026-01-01T10:00:00Z'), list)).toEqual(['t']);
    expect(await enqueueDueSchedules(t.db, new Date('2026-01-01T10:01:00Z'), list)).toEqual([]);
    expect(await enqueueDueSchedules(t.db, new Date('2026-01-01T10:04:59Z'), list)).toEqual([]);
    expect(await enqueueDueSchedules(t.db, new Date('2026-01-01T10:05:00Z'), list)).toEqual(['t']);

    const events = await rows('t');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.dedupeKey)).toEqual([
      'schedule:t:2026-01-01T10:00:00.000Z',
      'schedule:t:2026-01-01T10:05:00.000Z',
    ]);
    expect(events[0]?.payload).toEqual({ scheduledFor: '2026-01-01T10:00:00.000Z' });
  });

  it('enqueues the latest missed run once after a gap', async () => {
    await enqueueDueSchedules(t.db, new Date('2026-01-01T10:00:00Z'), list);
    expect(await enqueueDueSchedules(t.db, new Date('2026-01-01T11:02:00Z'), list)).toEqual(['t']);
    expect(await rows('t')).toHaveLength(2);
  });

  it('makes scheduled events available to the worker at once', async () => {
    const handler = vi.fn(async () => {});
    const now = new Date('2026-01-01T10:00:00Z');
    await enqueueDueSchedules(t.db, now, list);
    expect(await runWorker(t.db, { now, handlers: { t: handler } })).toEqual({
      processed: 1,
      retried: 0,
      dead: 0,
    });
  });

  it('skips an invalid cron expression and still enqueues the others', async () => {
    const errorSpy = quiet();
    const result = await enqueueDueSchedules(t.db, T0, [
      { topic: 'broken', cron: 'not a cron' },
      { topic: 'ok', cron: '0 * * * *' },
    ]);
    expect(result).toEqual(['ok']);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('cron'),
      expect.objectContaining({ topic: 'broken' }),
    );
  });

  it('reads the registered schedules by default', async () => {
    const result = await enqueueDueSchedules(t.db, T0);
    expect(result).toEqual(schedules.map((s) => s.topic));
  });

  it('accepts every registered schedule', () => {
    for (const s of schedules) {
      expect(() => lastDueAt(s.cron, T0), s.topic).not.toThrow();
    }
  });
});

describe('lastDueAt', () => {
  it('returns the latest cron time at or before now, in UTC', () => {
    const cron = '*/5 * * * *';
    expect(lastDueAt(cron, new Date('2026-01-01T10:00:00.000Z')).toISOString()).toBe(
      '2026-01-01T10:00:00.000Z',
    );
    expect(lastDueAt(cron, new Date('2026-01-01T10:04:59.999Z')).toISOString()).toBe(
      '2026-01-01T10:00:00.000Z',
    );
    expect(lastDueAt('0 9 * * 1', new Date('2026-11-04T12:00:00Z')).toISOString()).toBe(
      '2026-11-02T09:00:00.000Z',
    );
  });
});

describe('kickWorker', () => {
  const expectKick = (fetchMock: ReturnType<typeof vi.fn>) =>
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/jobs/run', {
      method: 'POST',
      headers: { 'x-jobs-secret': process.env.JOBS_SECRET },
    });

  it("hands the request to Next's after(), so a serverless function lives until it is sent", async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const tasks: (() => Promise<void>)[] = [];
    nextServer.after.mockImplementation((task: () => Promise<void>) => void tasks.push(task));

    expect(kickWorker()).toBeUndefined();
    expect(nextServer.after).toHaveBeenCalledTimes(1);
    // Nothing is sent while the response is still being written...
    expect(fetchMock).not.toHaveBeenCalled();
    // ...and the platform runs the task (awaiting it) once it is.
    await tasks[0]?.();
    expectKick(fetchMock);
  });

  it('accepts another scheduler, such as a waitUntil', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending: Promise<void>[] = [];
    kickWorker((task) => void pending.push(task()));
    await Promise.all(pending);
    expectKick(fetchMock);
    expect(nextServer.after).not.toHaveBeenCalled();
  });

  it('sends at once outside a request scope (scripts, tests)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    nextServer.after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope.');
    });
    expect(kickWorker()).toBeUndefined();
    expectKick(fetchMock);
  });

  it('logs a failed request instead of throwing', async () => {
    const errorSpy = quiet();
    nextServer.after.mockImplementation((task: () => Promise<void>) => void task());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    kickWorker();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });
});

describe('POST /api/jobs/run', () => {
  const call = (headers: Record<string, string> = {}) =>
    POST(new Request('http://localhost:3000/api/jobs/run', { method: 'POST', headers }));

  it('returns 401 without the secret header', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await call({ 'x-jobs-secret': 'x'.repeat(40) });
    expect(res.status).toBe(401);
  });

  it('enqueues due schedules, runs the worker and returns the counts', async () => {
    quiet();
    await enqueue(t.db, { topic: 'no.handler.here', payload: {}, availableAt: T0 });
    const res = await call({ 'x-jobs-secret': process.env.JOBS_SECRET ?? '' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = (await res.json()) as {
      scheduled: string[];
      processed: number;
      retried: number;
      dead: number;
    };
    // Every registered schedule is due on first sight (no schedule_runs rows yet).
    expect(body.scheduled).toEqual(schedules.map((s) => s.topic));
    expect(body.retried).toBeGreaterThanOrEqual(1);
    expect(body.processed + body.retried + body.dead).toBe(schedules.length + 1);
    const [row] = await rows('no.handler.here');
    expect(row?.attempts).toBe(1);
    expect(row?.status).toBe('pending');
  });
});
