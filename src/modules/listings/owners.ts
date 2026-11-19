// Who a listing revision belongs to, for another module's rule that keeps what a legal hold
// covers (trust.checks_12m: a check on a revision). Read-only, and reads only this module's
// tables, so the caller never names them in raw SQL (tests/lint/table-ownership.test.ts).
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { isUuid } from './access';
import { listingRevisions, listings } from './schema';

/** The organization an item belongs to and the people on it, without duplicates. */
export type ListingItemOwners = { orgId: string; userIds: string[] };

/**
 * The owners of each listing revision, by revision id, in one read: the listing's organization,
 * the person who submitted the revision and the person who created the listing. An id that is
 * not a uuid or names no revision is left out of the map.
 */
export async function listingRevisionOwners(
  db: DbOrTx,
  ids: readonly string[],
): Promise<Map<string, ListingItemOwners>> {
  const wanted = [...new Set(ids.filter(isUuid))];
  const out = new Map<string, ListingItemOwners>();
  if (wanted.length === 0) return out;
  const rows = await db
    .select({
      id: listingRevisions.id,
      orgId: listingRevisions.orgId,
      submittedBy: listingRevisions.submittedBy,
      createdBy: listings.createdBy,
    })
    .from(listingRevisions)
    .leftJoin(listings, eq(listings.id, listingRevisions.listingId))
    .where(inArray(listingRevisions.id, wanted));
  for (const row of rows) {
    out.set(row.id, { orgId: row.orgId, userIds: people(row.submittedBy, row.createdBy) });
  }
  return out;
}

function people(...ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
