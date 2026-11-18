import type { DbOrTx } from '@/lib/db';

/** W2 deletes blocked media whose evidence window has closed. */
export async function purgeBlockedMedia(_db: DbOrTx, _now: Date): Promise<{ deleted: number }> {
  throw new Error('not implemented: purgeBlockedMedia (W2)');
}
