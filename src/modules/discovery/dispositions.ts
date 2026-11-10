// Saved and skipped jobs (SP3 spec 8.8): mutually exclusive per user and listing, with
// optimistic concurrency through `expectedState`. W0 stub: W3 replaces it (Task 23).
import type { DbOrTx } from '@/lib/db';
import type { DiscoverySource, DispositionState, JobCardData } from '@/lib/discovery';

export async function setDisposition(
  _db: DbOrTx,
  _i: {
    userId: string;
    listingId: string;
    state: DispositionState;
    source: DiscoverySource;
    expectedState?: DispositionState | null;
  },
): Promise<{ state: DispositionState; previous: DispositionState | null }> {
  throw new Error('not implemented: setDisposition');
}

export async function clearDisposition(
  _db: DbOrTx,
  _i: { userId: string; listingId: string; expectedState?: DispositionState },
): Promise<{ previous: DispositionState | null }> {
  throw new Error('not implemented: clearDisposition');
}

/** Active and closed cards, newest first (SP4 My jobs). */
export async function listSavedJobs(
  _db: DbOrTx,
  _userId: string,
  _i: { limit: number; before?: string },
): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }> {
  throw new Error('not implemented: listSavedJobs');
}

export async function listSkippedJobs(
  _db: DbOrTx,
  _userId: string,
  _i: { limit: number; before?: string },
): Promise<{ items: JobCardData[]; nextBefore: string | null; total: number }> {
  throw new Error('not implemented: listSkippedJobs');
}

export async function unsaveJob(_db: DbOrTx, _userId: string, _listingId: string): Promise<void> {
  throw new Error('not implemented: unsaveJob');
}

export async function restoreSkippedJob(
  _db: DbOrTx,
  _userId: string,
  _listingId: string,
): Promise<void> {
  throw new Error('not implemented: restoreSkippedJob');
}
