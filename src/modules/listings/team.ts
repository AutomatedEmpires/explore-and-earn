// Who hears about a listing (spec section 6): the listing team is its creator plus the members
// it names in `applying.notifyMemberIds`, among current members who can access it; owner/admins
// and billing contacts are by role.
import type { DbOrTx } from '@/lib/db';
import { listMembers, type Member } from '@/modules/orgs';

type ListingRef = {
  id: string;
  orgId: string;
  createdBy: string | null;
  locationId: string | null;
};

/** Whether a member's role and recruiter scope let them see the listing. */
export function memberCanAccess(m: Member, l: { id: string; locationId: string | null }): boolean {
  if (m.role === 'billing') return false;
  if (m.role !== 'recruiter' || m.scope === null || m.scope.kind === 'all') return true;
  return (
    m.scope.listingIds.includes(l.id) ||
    (l.locationId !== null && m.scope.locationIds.includes(l.locationId))
  );
}

/** The membership ids a listing's content names in `applying.notifyMemberIds`. */
export function notifyMemberIdsOf(content: unknown): string[] {
  const ids = (content as { applying?: { notifyMemberIds?: unknown } } | null)?.applying
    ?.notifyMemberIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/** The listing team's user ids: the creator plus the named members, who can access it. */
export async function listingTeamUserIds(
  db: DbOrTx,
  listing: ListingRef & { notifyMemberIds?: string[] },
): Promise<string[]> {
  const members = await listMembers(db, listing.orgId);
  const named = new Set(listing.notifyMemberIds ?? []);
  const out = members
    .filter((m) => m.userId === listing.createdBy || named.has(m.membershipId))
    .filter((m) => memberCanAccess(m, listing))
    .map((m) => m.userId);
  return [...new Set(out)];
}

/** The org's Owner and Admins. */
export async function ownerAdminUserIds(db: DbOrTx, orgId: string): Promise<string[]> {
  const members = await listMembers(db, orgId);
  return members.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.userId);
}

/** Owner, Admins and Billing members. */
export async function billingContactUserIds(db: DbOrTx, orgId: string): Promise<string[]> {
  const members = await listMembers(db, orgId);
  return members
    .filter((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'billing')
    .map((m) => m.userId);
}

/** `a` plus the ids of `b` that `a` lacks. */
export function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
