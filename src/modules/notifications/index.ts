// Public API of the notifications module (in-app, email, push). Owned by W6 (Tasks 17-19).
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

/** Notifies a user on every channel the type and their preferences allow.
 * Stub (no-op): Task 17 replaces it. */
export async function notify(
  _db: DbOrTx,
  _userId: string,
  _type: string,
  _data: Record<string, unknown>,
): Promise<void> {}

export const jobHandlers: HandlerMap = {};
