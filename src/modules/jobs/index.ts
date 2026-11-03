// Public API of the jobs module (outbox, worker, scheduler). Owned by W3 (Task 9).
import type { Db, DbOrTx } from '@/lib/db';

/** Handles one outbox event. Throwing schedules a retry. */
export type Handler = (payload: unknown, ctx: { db: Db; now: Date }) => Promise<void>;
export type HandlerMap = Record<string, Handler>;

export type EnqueueInput = {
  topic: string;
  payload: unknown;
  /** Events with the same key are enqueued once. */
  dedupeKey?: string;
  availableAt?: Date;
};

/** Writes an outbox event in the caller's transaction. Stub: Task 9 replaces it. */
export async function enqueue(_db: DbOrTx, _e: EnqueueInput): Promise<void> {
  throw new Error('not implemented');
}

export const jobHandlers: HandlerMap = {};
