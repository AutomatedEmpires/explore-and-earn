// Checks that a Recruiter scope names only the caller's own listings and locations (SP2 spec
// section 10: a cross-org id is 404). The orgs module can't import listings or locations, so
// the invitation and member routes run this before calling orgs.
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { getListingSummaries } from '@/modules/listings';
import { getLocations } from '@/modules/locations';
import type { RecruiterScope } from '@/modules/orgs';

/**
 * Throws 404 `not_found` unless every assigned listing belongs to `orgId` and every assigned
 * location is one of its live (not archived) locations. A scope of `all` (or none) passes.
 */
export async function assertScopeInOrg(
  db: DbOrTx,
  orgId: string,
  scope: RecruiterScope | null | undefined,
): Promise<void> {
  if (!scope || scope.kind === 'all') return;
  const listingIds = [...new Set(scope.listingIds)];
  const locationIds = [...new Set(scope.locationIds)];

  const [listings, locations] = await Promise.all([
    listingIds.length > 0 ? getListingSummaries(db, listingIds) : null,
    locationIds.length > 0 ? getLocations(db, locationIds) : null,
  ]);
  for (const id of listingIds) {
    if (listings?.get(id)?.orgId !== orgId) throw notFound('Listing not found');
  }
  for (const id of locationIds) {
    const location = locations?.get(id);
    if (!location || location.orgId !== orgId || location.archived) {
      throw notFound('Location not found');
    }
  }
}
