// Synthetic projection rows for the performance gate (SP3 spec 11). W0 stub: W1 replaces it
// (Task 11).
import type { Db } from '@/lib/db';

/** Writes `count` deterministic projection rows; throws when APP_ENV=prod. */
export async function seedSynthetic(_db: Db, _i: { count: number; seed: number }): Promise<void> {
  throw new Error('not implemented: seedSynthetic');
}
