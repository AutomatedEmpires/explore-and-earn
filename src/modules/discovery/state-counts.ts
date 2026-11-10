// Browse by State counts (FD-8 addendum): one entry per US_STATES code, from the same active rows
// and filter as Seek. W0 stub: W2 replaces it (Task 49).
import type { DbOrTx } from '@/lib/db';
import type { StateCount } from '@/lib/discovery';

export async function countListingsByState(
  _db: DbOrTx,
  _i: { tz: string },
): Promise<StateCount[]> {
  throw new Error('not implemented: countListingsByState');
}
