import { sql } from 'drizzle-orm';
import { after } from 'next/server';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { outbox } from './schema';

export type EnqueueInput = {
  topic: string;
  /** Any JSON-serializable value. `undefined` is stored as JSON `null`. */
  payload: unknown;
  /** Events with the same key are enqueued once, even after the first one is done. */
  dedupeKey?: string;
  /** Not before this time. Defaults to now. */
  availableAt?: Date;
};

/**
 * Writes an outbox event in the caller's transaction, so the side effect commits (or rolls
 * back) together with the change that caused it. A second event with the same `dedupeKey` is
 * dropped. Call `kickWorker()` after the transaction commits to handle it right away.
 */
export async function enqueue(db: DbOrTx, e: EnqueueInput): Promise<void> {
  if (!e.topic) throw new Error('enqueue: topic is required');
  await db
    .insert(outbox)
    .values({
      id: newId(),
      topic: e.topic,
      payload: sql`${JSON.stringify(e.payload ?? null)}::jsonb`,
      dedupeKey: e.dedupeKey ?? null,
      // The worker compares against the app clock (millisecond Dates), so stamp it here rather
      // than with the database's microsecond now().
      availableAt: e.availableAt ?? new Date(),
    })
    .onConflictDoNothing({ target: outbox.dedupeKey });
}

/** Runs a task after the response is sent, keeping the function alive until it settles. */
export type Scheduler = (task: () => Promise<void>) => void;

/**
 * Asks the worker to run now instead of at the next scheduler tick. Fire and forget: it never
 * throws and never waits, and logs a failure. Call it only after the enqueuing transaction has
 * committed; the scheduler picks the event up within a minute either way.
 *
 * Call it inside a request (a route handler or server function): the request goes through
 * `schedule`, by default Next's `after()`, because a serverless function may be frozen as soon
 * as its response is sent, and a bare `fetch` would then often never leave. Outside a request
 * scope (scripts, tests) `after()` throws, and the request is sent at once instead.
 */
export function kickWorker(schedule: Scheduler = after): void {
  let url: string;
  let secret: string;
  try {
    const env = getEnv();
    url = `${env.APP_URL.replace(/\/+$/, '')}/api/jobs/run`;
    secret = env.JOBS_SECRET;
  } catch (err) {
    logger.error('kickWorker: environment is not available', { error: err });
    return;
  }

  const send = async (): Promise<void> => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'x-jobs-secret': secret } });
      if (!res.ok) logger.warn('kickWorker: worker responded with an error', { status: res.status });
      await res.body?.cancel();
    } catch (err) {
      logger.error('kickWorker: request failed', { error: err });
    }
  };

  try {
    schedule(send);
  } catch {
    // No request scope to attach to: nothing will freeze this process mid-request.
    void send();
  }
}
