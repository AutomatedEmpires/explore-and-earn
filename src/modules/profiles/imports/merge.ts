// Merging a reviewed import into the profile, in one transaction (SP4 spec 8.6). W0 stub: W3
// implements it (Task 17).
import type { Db } from '@/lib/db';
import type { MergeDecisions, OwnProfileDto } from '@/lib/profiles';

/** 409 `profile_changed` when a targeted field changed since the import started. */
export async function mergeImport(
  _db: Db,
  _userId: string,
  _importId: string,
  _i: { decisions: MergeDecisions; useAsResume: boolean },
): Promise<OwnProfileDto> {
  throw new Error('not implemented: mergeImport');
}
