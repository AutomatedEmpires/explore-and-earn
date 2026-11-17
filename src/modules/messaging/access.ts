// Who may see a listing, and who is looking at a thread.
import type { DbOrTx } from '@/lib/db';
import { getHiringInfoMany, listForOrg } from '@/modules/listings';
import { canAccessListing, getListingAccess, listMembers, requireCapability } from '@/modules/orgs';
import type { Member } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';

export type ListingScope = { all: true } | { all: false; listingIds: string[] };
export type ThreadViewer = { kind: 'seeker'; userId: string } | { kind: 'host'; ctx: HostContext };

const TEAM = new Set<Member['role']>(['owner', 'admin', 'recruiter']);

function asHost(orgId: string, member: Member): HostContext {
  return {
    user: { id: member.userId, clerkUserId: member.userId, accountType: 'host', email: member.email },
    orgId,
    role: member.role,
  };
}

/** Listings this host may hire for. An assigned recruiter's ids are sorted. */
export async function listingScope(db: DbOrTx, ctx: HostContext): Promise<ListingScope> {
  const access = await getListingAccess(db, ctx);
  if (access.all) return { all: true };
  const rows = await listForOrg(db, ctx.orgId);
  const listingIds = rows
    .filter(
      (row) =>
        access.listingIds.includes(row.id) ||
        (row.locationId !== null && access.locationIds.includes(row.locationId)),
    )
    .map((row) => row.id)
    .sort();
  return { all: false, listingIds };
}

export function inScope(scope: ListingScope, listingId: string): boolean {
  return scope.all || scope.listingIds.includes(listingId);
}

/** User ids told about a listing, or the owner and admins when that list is empty. */
export async function listingTeam(db: DbOrTx, i: { orgId: string; listingId: string }): Promise<string[]> {
  const [info] = await getHiringInfoMany(db, [i.listingId]);
  const members = await listMembers(db, i.orgId);
  const notify = new Set(info?.notifyMemberIds ?? []);
  const listing = { id: i.listingId, locationId: info?.locationId ?? null };
  const allowed = async (member: Member) => canAccessListing(db, asHost(i.orgId, member), listing);
  const notified: string[] = [];
  for (const member of members) {
    if (!notify.has(member.membershipId) || !TEAM.has(member.role)) continue;
    if (await allowed(member)) notified.push(member.userId);
  }
  if (notified.length > 0) return notified;
  const fallback: string[] = [];
  for (const member of members) {
    if (member.role !== 'owner' && member.role !== 'admin') continue;
    if (await allowed(member)) fallback.push(member.userId);
  }
  return fallback;
}

export function requireHiringCapability(
  ctx: HostContext,
  cap: 'applicants.access' | 'messages.access' | 'invites.send',
): void {
  requireCapability(ctx, cap);
}
