// Search box suggestions: jobs, places and employers (SP3 spec section 5). W0 stub: W2
// replaces it (Task 21).
import type { DbOrTx } from '@/lib/db';

export async function suggest(
  _db: DbOrTx,
  _q: string,
): Promise<{
  jobs: { label: string; q: string }[];
  places: { label: string; kind: 'state' | 'destination'; value: string }[];
  employers: { label: string; orgId: string; slug: string }[];
}> {
  throw new Error('not implemented: suggest');
}
