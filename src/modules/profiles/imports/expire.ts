// `profiles.import_expire` (hourly): expires unmerged imports after 30 days and deletes source
// files nothing references (SP4 spec 6). W0 stub: W3 implements it (Task 18).
import type { Db } from '@/lib/db';

export async function expireImports(
  _db: Db,
  _now: Date,
  _limit: number,
): Promise<{ expired: number; removed: number }> {
  throw new Error('not implemented: expireImports');
}
