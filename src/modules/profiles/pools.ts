// Candidate pools, staged cards, fit inputs and reveals (SP4 spec 3.2 and 8.3). W0 stub: W1
// implements it (Task 11).
import type { DbOrTx } from '@/lib/db';
import type { CandidateCard, FitInputs, PoolCard, PoolListing } from '@/lib/profiles';

/** Seekers who meet every pool rule for the listing, by availability date then user id. */
export async function queryPoolCandidates(
  _db: DbOrTx,
  _i: { listing: PoolListing; limit: number; after?: string },
): Promise<{ items: PoolCard[]; next: string | null }> {
  throw new Error('not implemented: queryPoolCandidates');
}

/** Cards for the org at a stage; drops ineligible, unrevealed and blocked seekers. */
export async function getCandidateCards(
  _db: DbOrTx,
  _i: { orgId: string; seekerUserIds: string[]; stage: 'pool' | 'interested' },
): Promise<CandidateCard[]> {
  throw new Error('not implemented: getCandidateCards');
}

/** Server only, never serialized. */
export async function getFitInputs(_db: DbOrTx, _seekerUserIds: string[]): Promise<FitInputs[]> {
  throw new Error('not implemented: getFitInputs');
}

/** Idempotent. */
export async function grantReveal(
  _db: DbOrTx,
  _i: {
    seekerUserId: string;
    orgId: string;
    reason: 'applied' | 'invite_interested';
    sourceId: string;
  },
): Promise<{ created: boolean }> {
  throw new Error('not implemented: grantReveal');
}
