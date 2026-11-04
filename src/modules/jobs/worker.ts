import { and, eq, inArray, sql } from 'drizzle-orm';
import { queryRows, type Db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { safeErrorMessage } from '@/lib/scrub';
import { outbox } from './schema';

/** Handles one outbox event. Throwing schedules a retry. */
export type Handler = (payload: unknown, ctx: { db: Db; now: Date }) => Promise<void>;
export type HandlerMap = Record<string, Handler>;

export type WorkerResult = { processed: number; retried: number; dead: number };

/** An event that just went `dead` (dead-letter): it will never run again by itself. */
export type DeadEvent = { eventId: string; topic: string; attempts: number; error: string | null };

/** Raises the alert for a dead event. A failure is logged; the event stays dead either way. */
export type DeadEventHook = (db: Db, dead: DeadEvent) => Promise<void>;

export type WorkerOptions = {
  /** Events claimed per round trip. Default 20. */
  batchSize?: number;
  /** A fixed clock (tests). Without it, each batch reads the current time. */
  now?: Date;
  /** Defaults to every module's handlers (src/server/job-handlers.ts). */
  handlers?: HandlerMap;
  /** Defaults to the operator alert in src/server/job-handlers.ts (`onDeadEvent`). */
  onDead?: DeadEventHook;
};

/** After this many failed attempts an event is `dead`. */
export const MAX_ATTEMPTS = 8;
/** A `processing` lock older than this is presumed abandoned (crashed worker) and reclaimed. */
export const LOCK_TIMEOUT_MINUTES = 10;

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
const JITTER = 0.2;
const DEFAULT_BATCH_SIZE = 20;
/**
 * Start no new event after this long. The jobs route allows 60 s (maxDuration), so the last
 * event started has 35 s to finish before the platform stops the function.
 */
const TIME_BUDGET_MS = 25_000;
const MAX_ERROR_LENGTH = 2_000;

/**
 * Delay before retrying an event that has failed `attempt + 1` times:
 * `min(30s × 2^attempt, 6h)` with ±20% jitter. `rand` returns a number in [0, 1).
 */
export function nextDelayMs(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempt), MAX_DELAY_MS);
  const r = Math.min(Math.max(rand(), 0), 1);
  return Math.round(base * (1 - JITTER + 2 * JITTER * r));
}

type ClaimedRow = { id: string; topic: string; payload: string; attempts: number; at: number };

/**
 * Atomically claims up to `limit` events: available pending ones, plus processing ones whose
 * lock expired. `for update skip locked` makes concurrent workers take disjoint rows, and a row
 * another worker has just claimed no longer matches when it is re-checked, so every claim is
 * exclusive. The claim counts as an attempt, so a handler that crashes the process still runs
 * out of attempts.
 */
async function claimBatch(db: Db, now: Date, limit: number): Promise<ClaimedRow[]> {
  const claimed = await queryRows<ClaimedRow>(
    db,
    sql`
      with claimable as materialized (
        select id from app.outbox
        where (status = 'pending' and available_at <= ${now}::timestamptz)
           or (status = 'processing'
               and locked_at < ${now}::timestamptz - make_interval(mins => ${LOCK_TIMEOUT_MINUTES}::int)
               and attempts < ${MAX_ATTEMPTS}::int)
        order by available_at, id
        limit ${limit}::int
        for update skip locked
      )
      update app.outbox o
      set status = 'processing', locked_at = ${now}::timestamptz, attempts = o.attempts + 1
      from claimable c
      where o.id = c.id
      returning o.id, o.topic, o.payload::text as payload, o.attempts,
        extract(epoch from o.available_at)::float8 as at
    `,
  );
  // RETURNING has no defined order; handle the oldest first.
  return claimed.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

async function defaultDeadHook(): Promise<DeadEventHook> {
  // Loaded lazily, like the handlers: the registry imports every module, including this one.
  const registry = await import('@/server/job-handlers');
  return registry.onDeadEvent;
}

/**
 * Raises the alarm for an event that just went dead (spec section 5): a Sentry event grouped
 * by topic, then `hook` (an operator alert), which runs after the dead update, in its own
 * transaction. Neither can undo the dead state, and a failing alert is logged, not thrown.
 */
async function reportDead(db: Db, dead: DeadEvent, hook: DeadEventHook | undefined) {
  try {
    // Loaded here, not at the top: every module imports this one, and the SDK is heavy.
    const { captureMessage } = await import('@sentry/nextjs');
    captureMessage(`Outbox event is dead: ${dead.topic}`, {
      level: 'error',
      tags: { topic: dead.topic, eventId: dead.eventId },
      extra: { attempts: dead.attempts },
      fingerprint: ['outbox-dead', dead.topic],
    });
  } catch (err) {
    logger.error('outbox: could not report a dead event to Sentry', {
      eventId: dead.eventId,
      topic: dead.topic,
      error: err,
    });
  }
  try {
    await (hook ?? (await defaultDeadHook()))(db, dead);
  } catch (err) {
    logger.error('outbox: could not raise the alert for a dead event', {
      eventId: dead.eventId,
      topic: dead.topic,
      error: err,
    });
  }
}

const LOCK_EXPIRED = 'lock expired on the final attempt';

/** Abandoned events that already used their last attempt go straight to `dead`. */
async function buryExhausted(db: Db, now: Date, hook: DeadEventHook | undefined): Promise<number> {
  const rows = await queryRows<{ id: string; topic: string; attempts: number }>(
    db,
    sql`
      update app.outbox
      set status = 'dead', locked_at = null,
        last_error = coalesce(last_error || E'\n', '') || ${LOCK_EXPIRED}
      where status = 'processing'
        and locked_at < ${now}::timestamptz - make_interval(mins => ${LOCK_TIMEOUT_MINUTES}::int)
        and attempts >= ${MAX_ATTEMPTS}::int
      returning id, topic, attempts
    `,
  );
  for (const row of rows) {
    logger.error('outbox event is dead: its final attempt never finished', {
      eventId: row.id,
      topic: row.topic,
      attempts: row.attempts,
    });
    const dead = { eventId: row.id, topic: row.topic, attempts: row.attempts, error: LOCK_EXPIRED };
    await reportDead(db, dead, hook);
  }
  return rows.length;
}

async function markDone(db: Db, row: ClaimedRow, now: Date): Promise<void> {
  const updated = await queryRows(
    db,
    sql`
      update app.outbox set status = 'done', locked_at = null, last_error = null
      where id = ${row.id} and status = 'processing' and locked_at = ${now}::timestamptz
      returning id
    `,
  );
  if (updated.length === 0) {
    // The lock expired and another worker reclaimed the event while this one was running.
    logger.warn('outbox event finished after its lock expired', {
      eventId: row.id,
      topic: row.topic,
    });
  }
}

async function markFailed(
  db: Db,
  row: ClaimedRow,
  now: Date,
  err: unknown,
  hook: DeadEventHook | undefined,
): Promise<'retried' | 'dead'> {
  // Stored, so never a failed query's parameters (they are often emails or names).
  const message = safeErrorMessage(err).slice(0, MAX_ERROR_LENGTH);
  const fields = { eventId: row.id, topic: row.topic, attempts: row.attempts, error: err };

  if (row.attempts >= MAX_ATTEMPTS) {
    const buried = await queryRows(
      db,
      sql`
        update app.outbox set status = 'dead', locked_at = null, last_error = ${message}
        where id = ${row.id} and status = 'processing' and locked_at = ${now}::timestamptz
        returning id
      `,
    );
    logger.error(`outbox event is dead after ${row.attempts} attempts`, fields);
    // Only the worker whose update took raises the alarm (another may have reclaimed it).
    if (buried.length > 0) {
      const dead = { eventId: row.id, topic: row.topic, attempts: row.attempts, error: message };
      await reportDead(db, dead, hook);
    }
    return 'dead';
  }

  const retryAt = new Date(now.getTime() + nextDelayMs(row.attempts - 1));
  await db.execute(sql`
    update app.outbox
    set status = 'pending', locked_at = null, last_error = ${message},
      available_at = ${retryAt}::timestamptz
    where id = ${row.id} and status = 'processing' and locked_at = ${now}::timestamptz
  `);
  logger.warn('outbox event failed; will retry', { ...fields, retryAt: retryAt.toISOString() });
  return 'retried';
}

/**
 * Hands back events this run claimed but never started (the time budget ran out): pending
 * again, unlocked, and with the claim's attempt returned, so being late in a batch never
 * uses up an event's attempts.
 */
async function releaseUnstarted(db: Db, rows: ClaimedRow[], now: Date): Promise<void> {
  if (rows.length === 0) return;
  await db
    .update(outbox)
    .set({ status: 'pending', lockedAt: null, attempts: sql`${outbox.attempts} - 1` })
    .where(
      and(
        inArray(
          outbox.id,
          rows.map((r) => r.id),
        ),
        eq(outbox.status, 'processing'),
        eq(outbox.lockedAt, now),
      ),
    );
}

async function defaultHandlers(): Promise<HandlerMap> {
  // Loaded lazily: the registry imports every module, including this one.
  const registry = await import('@/server/job-handlers');
  return registry.handlers;
}

/**
 * Drains the outbox: claims batches and sends each event to its topic's handler until nothing
 * is available or the time budget is spent. The budget is checked before every event; claimed
 * events left over when it runs out are handed back untouched. Safe to run concurrently (the
 * scheduler tick and a post-commit kick): each claimed event is handled by exactly one worker.
 * A failure is retried with backoff (`nextDelayMs`) and after `MAX_ATTEMPTS` the event is `dead`,
 * which is reported to Sentry and raised as an operator alert (`opts.onDead`).
 */
export async function runWorker(db: Db, opts: WorkerOptions = {}): Promise<WorkerResult> {
  const batchSize = Math.max(1, Math.floor(opts.batchSize ?? DEFAULT_BATCH_SIZE));
  const handlers = opts.handlers ?? (await defaultHandlers());
  const deadline = Date.now() + TIME_BUDGET_MS;
  const result: WorkerResult = { processed: 0, retried: 0, dead: 0 };

  result.dead += await buryExhausted(db, opts.now ?? new Date(), opts.onDead);

  while (Date.now() < deadline) {
    const now = opts.now ?? new Date();
    const batch = await claimBatch(db, now, batchSize);
    if (batch.length === 0) break;

    for (const [index, row] of batch.entries()) {
      if (Date.now() >= deadline) {
        await releaseUnstarted(db, batch.slice(index), now);
        return result;
      }
      const handler = Object.hasOwn(handlers, row.topic) ? handlers[row.topic] : undefined;
      let ok = false;
      let failure: unknown;
      try {
        if (!handler) throw new Error(`No handler for topic "${row.topic}"`);
        await handler(JSON.parse(row.payload) as unknown, { db, now });
        ok = true;
      } catch (err) {
        failure = err;
      }

      if (ok) {
        await markDone(db, row, now);
        result.processed++;
      } else {
        result[await markFailed(db, row, now, failure, opts.onDead)]++;
      }
    }
  }

  return result;
}
