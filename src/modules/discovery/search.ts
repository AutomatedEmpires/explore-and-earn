// Search over the projection: Seek, the Swipe deck and the Map list (SP3 spec 3.1, 8.1 and
// 8.4). W0 stub: W2 replaces it (Tasks 18, 19 and 21).
import type { DbOrTx } from '@/lib/db';
import type { DiscoveryQuery, DiscoverySort, JobCardData } from '@/lib/discovery';

export type SearchInput = {
  query: DiscoveryQuery;
  sort: DiscoverySort;
  surface: 'seek' | 'swipe' | 'map_list';
  cursor?: string;
  limit?: number;
  origin?: { lat: number; lng: number };
  tz: string;
  viewerUserId: string | null;
  viewerKey: string;
};

export async function searchListings(
  _db: DbOrTx,
  _i: SearchInput,
): Promise<{
  items: JobCardData[];
  nextCursor: string | null;
  total: number;
  totalCapped: boolean;
}> {
  throw new Error('not implemented: searchListings');
}

/** Active cards only, in input order. */
export async function getJobCards(
  _db: DbOrTx,
  _listingIds: string[],
  _opts?: { viewerUserId?: string | null; tz?: string },
): Promise<JobCardData[]> {
  throw new Error('not implemented: getJobCards');
}

/** The ids among `listingIds` that match `query` for this viewer (SP6 placement). */
export async function matchListingIds(
  _db: DbOrTx,
  _i: { listingIds: string[]; query: DiscoveryQuery; viewerUserId: string | null },
): Promise<string[]> {
  throw new Error('not implemented: matchListingIds');
}

/** New active listings since `since` (SP7's community digest). */
export async function countNewListings(
  _db: DbOrTx,
  _i: { since: Date },
): Promise<{ listings: number; hosts: number; withHousing: number }> {
  throw new Error('not implemented: countNewListings');
}
