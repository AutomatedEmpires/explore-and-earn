// Recruiter scopes (SP2 spec section 8.1): which listings a member may work on. Owners, Admins
// and Recruiters with scope `all` see every listing; an `assigned` Recruiter sees the listings
// and locations in member_assignments; Billing members see none.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { HostContext } from '@/server/guards';
import { liveMembershipOf, scopesFor } from './members';
import type { RecruiterScope } from './roles';
import { memberAssignments, orgMemberships } from './schema';

export type ListingAccess =
  { all: true } | { all: false; listingIds: string[]; locationIds: string[] };

/** Owner, Admin and Recruiters with scope `all` see everything; Billing sees no listings. */
export async function getListingAccess(db: DbOrTx, ctx: HostContext): Promise<ListingAccess> {
  const row = await liveMembershipOf(db, ctx.orgId, ctx.user.id);
  if (!row || row.role === 'billing') return { all: false, listingIds: [], locationIds: [] };
  if (row.role === 'owner' || row.role === 'admin') return { all: true };
  const scope = (await scopesFor(db, [row])).get(row.id);
  if (!scope || scope.kind === 'all') return { all: true };
  return { all: false, listingIds: scope.listingIds, locationIds: scope.locationIds };
}

/** True when the caller's access covers the listing, by its id or its location. SP5. */
export async function canAccessListing(
  db: DbOrTx,
  ctx: HostContext,
  l: { id: string; locationId: string | null },
): Promise<boolean> {
  const access = await getListingAccess(db, ctx);
  if (access.all) return true;
  return (
    access.listingIds.includes(l.id) ||
    (l.locationId !== null && access.locationIds.includes(l.locationId))
  );
}

/**
 * Assigns a listing to an `assigned` Recruiter (listings they create are auto-assigned). For
 * any other member it changes nothing, since they already see every listing (or, for Billing,
 * none). Throws `not_found` when the user isn't a live member of the org.
 */
export async function assignListing(
  db: DbOrTx,
  orgId: string,
  userId: string,
  listingId: string,
): Promise<void> {
  const row = await liveMembershipOf(db, orgId, userId);
  if (!row) throw notFound('Member not found');
  if (row.role !== 'recruiter' || row.recruiterScope !== 'assigned') return;
  await db
    .insert(memberAssignments)
    .values({ id: newId(), membershipId: row.id, listingId })
    .onConflictDoNothing();
}

/** The scope a membership of `role` stores: Recruiters keep theirs, everyone else `all`. */
export function storedScope(
  role: string,
  scope: RecruiterScope | undefined | null,
): { recruiterScope: 'all' | 'assigned'; listingIds: string[]; locationIds: string[] } {
  if (role !== 'recruiter' || !scope || scope.kind === 'all') {
    return { recruiterScope: 'all', listingIds: [], locationIds: [] };
  }
  return {
    recruiterScope: 'assigned',
    listingIds: [...new Set(scope.listingIds)],
    locationIds: [...new Set(scope.locationIds)],
  };
}

/** Sets a membership's scope column and replaces its assignments to match. */
export async function replaceAssignments(
  db: DbOrTx,
  membershipId: string,
  role: string,
  scope: RecruiterScope | undefined | null,
): Promise<void> {
  const s = storedScope(role, scope);
  await db
    .update(orgMemberships)
    .set({ recruiterScope: s.recruiterScope })
    .where(eq(orgMemberships.id, membershipId));
  await db.delete(memberAssignments).where(eq(memberAssignments.membershipId, membershipId));
  const rows = [
    ...s.listingIds.map((listingId) => ({ id: newId(), membershipId, listingId })),
    ...s.locationIds.map((locationId) => ({ id: newId(), membershipId, locationId })),
  ];
  if (rows.length > 0) await db.insert(memberAssignments).values(rows);
}
