// A SQL-backed orgs module for B1 tests that mock '@/modules/orgs', over the Foundation and
// 1000_orgs tables. It follows the Task 17 and 19 rules for scopes and slugs, but records no
// audit and emits no events (setOrgStatus and setVerificationStatus only write the row).
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { memberAssignments, organizations, orgMemberships, orgSlugs, users } from '@/db/schema';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type {
  ListingAccess,
  Member,
  OrgStatus,
  OrgSummary,
  OrgVerificationStatus,
  RecruiterScope,
} from '@/modules/orgs';
import type { HostContext } from '@/server/guards';

const calls: { name: string; args: unknown[] }[] = [];
const log = (name: string, args: unknown[]) => calls.push({ name, args });

type MembershipRow = {
  membershipId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: Member['role'];
  recruiterScope: 'all' | 'assigned';
  joinedAt: Date;
};

async function memberships(db: DbOrTx, orgId: string, userId?: string): Promise<MembershipRow[]> {
  return db
    .select({
      membershipId: orgMemberships.id,
      userId: orgMemberships.userId,
      displayName: users.displayName,
      email: users.email,
      role: orgMemberships.role,
      recruiterScope: orgMemberships.recruiterScope,
      joinedAt: orgMemberships.createdAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(users.id, orgMemberships.userId))
    .where(
      and(
        eq(orgMemberships.orgId, orgId),
        isNull(orgMemberships.deletedAt),
        userId === undefined ? undefined : eq(orgMemberships.userId, userId),
      ),
    )
    .orderBy(orgMemberships.createdAt);
}

async function scopeOf(db: DbOrTx, m: MembershipRow): Promise<RecruiterScope | null> {
  if (m.role !== 'recruiter') return null;
  if (m.recruiterScope === 'all') return { kind: 'all' };
  const rows = await db
    .select({ listingId: memberAssignments.listingId, locationId: memberAssignments.locationId })
    .from(memberAssignments)
    .where(eq(memberAssignments.membershipId, m.membershipId));
  return {
    kind: 'assigned',
    listingIds: rows.flatMap((r) => (r.listingId ? [r.listingId] : [])),
    locationIds: rows.flatMap((r) => (r.locationId ? [r.locationId] : [])),
  };
}

async function toMember(db: DbOrTx, m: MembershipRow): Promise<Member> {
  return {
    membershipId: m.membershipId,
    userId: m.userId,
    displayName: m.displayName,
    email: m.email,
    role: m.role,
    scope: await scopeOf(db, m),
    joinedAt: m.joinedAt,
  };
}

async function getListingAccess(db: DbOrTx, ctx: HostContext): Promise<ListingAccess> {
  log('getListingAccess', [ctx.orgId, ctx.user.id]);
  const [m] = await memberships(db, ctx.orgId, ctx.user.id);
  if (!m || m.role === 'billing') return { all: false, listingIds: [], locationIds: [] };
  const scope = await scopeOf(db, m);
  if (scope === null || scope.kind === 'all') return { all: true };
  return { all: false, listingIds: scope.listingIds, locationIds: scope.locationIds };
}

const fns = {
  async listMembers(db: DbOrTx, orgId: string) {
    log('listMembers', [orgId]);
    const rows = await memberships(db, orgId);
    return Promise.all(rows.map((m) => toMember(db, m)));
  },

  async getMember(db: DbOrTx, orgId: string, userId: string) {
    log('getMember', [orgId, userId]);
    const [m] = await memberships(db, orgId, userId);
    return m ? toMember(db, m) : null;
  },

  async getOrgStatus(db: DbOrTx, orgId: string): Promise<OrgStatus> {
    log('getOrgStatus', [orgId]);
    const [row] = await db
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!row) throw notFound('Organization not found');
    return row.status;
  },

  async getOrgSummaries(db: DbOrTx, ids: string[]) {
    log('getOrgSummaries', [ids]);
    const out = new Map<string, OrgSummary>();
    if (ids.length === 0) return out;
    const rows = await db.select().from(organizations).where(inArray(organizations.id, ids));
    for (const o of rows) {
      out.set(o.id, {
        id: o.id,
        clerkOrgId: o.clerkOrgId,
        name: o.name,
        slug: o.slug,
        status: o.status,
        deleted: o.deletedAt !== null,
        websiteUrl: o.websiteUrl,
        requireRecruiterApproval: o.requireRecruiterApproval,
        primaryLocationId: o.primaryLocationId,
        verificationStatus: o.verificationStatus,
        ownerUserId: o.ownerUserId,
        createdAt: o.createdAt,
      });
    }
    return out;
  },

  async setOrgStatus(
    db: DbOrTx,
    orgId: string,
    status: OrgStatus,
    actor: unknown,
    reason?: string,
  ) {
    log('setOrgStatus', [orgId, status, actor, reason]);
    await db.update(organizations).set({ status }).where(eq(organizations.id, orgId));
  },

  async setVerificationStatus(db: DbOrTx, orgId: string, status: OrgVerificationStatus, at?: Date) {
    log('setVerificationStatus', [orgId, status, at]);
    await db
      .update(organizations)
      .set({
        verificationStatus: status,
        ...(status === 'verified' ? { verifiedAt: at ?? new Date() } : {}),
      })
      .where(eq(organizations.id, orgId));
  },

  async assignListing(db: DbOrTx, orgId: string, userId: string, listingId: string) {
    log('assignListing', [orgId, userId, listingId]);
    const [m] = await memberships(db, orgId, userId);
    if (!m) throw notFound('Member not found');
    await db
      .insert(memberAssignments)
      .values({ id: newId(), membershipId: m.membershipId, listingId })
      .onConflictDoNothing();
  },

  getListingAccess,

  async canAccessListing(
    db: DbOrTx,
    ctx: HostContext,
    l: { id: string; locationId: string | null },
  ) {
    log('canAccessListing', [ctx.orgId, ctx.user.id, l]);
    const access = await getListingAccess(db, ctx);
    if (access.all) return true;
    return (
      access.listingIds.includes(l.id) ||
      (l.locationId !== null && access.locationIds.includes(l.locationId))
    );
  },

  async resolveSlug(db: DbOrTx, slug: string) {
    log('resolveSlug', [slug]);
    const [row] = await db
      .select({
        orgId: orgSlugs.orgId,
        currentSlug: organizations.slug,
        deletedAt: organizations.deletedAt,
      })
      .from(orgSlugs)
      .innerJoin(organizations, eq(organizations.id, orgSlugs.orgId))
      .where(eq(orgSlugs.slug, slug));
    if (!row || row.deletedAt !== null) return null;
    return { orgId: row.orgId, currentSlug: row.currentSlug, retired: row.currentSlug !== slug };
  },
} satisfies Partial<typeof import('@/modules/orgs')>;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/orgs'), keyof typeof fns>;

export const orgsFake = Object.assign(fns as Fns, {
  calls,
  reset() {
    calls.length = 0;
  },
});
