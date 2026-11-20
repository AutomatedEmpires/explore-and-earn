// The public listing detail (SP3 spec 8.9): active listings read SP2 on every request, closed
// ones render from the projection, removed ones are null. W0 stub: W2 replaces it (Task 21).
import type { DbOrTx } from '@/lib/db';
import type { JobCardData, ListingDetail } from '@/lib/discovery';

export async function getListingDetail(
  _db: DbOrTx,
  _i: { listingId: string; viewerUserId: string | null; tz: string },
): Promise<ListingDetail | { status: 'closed'; card: JobCardData } | null> {
  throw new Error('not implemented: getListingDetail');
}
