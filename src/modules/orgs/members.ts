// Team members: live memberships of an organization with their role and recruiter scope.
// A removed membership keeps its row (deleted_at set) so reordered Clerk events can't revive
// it; every read here skips those rows.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getPeople } from './people';
import type { Member, RecruiterScope } from './roles';
import { memberAssignments, orgMemberships } from './schema';

export type MembershipRow = typeof orgMemberships.$inferSelect;

/** The recruiter scope of each membership (null for every role but Recruiter). */
export async function scopesFor(
  db: DbOrTx,
  rows: readonly Pick<MembershipRow, 'id' | 'role' | 'recruiterScope'>[],
): Promise<Map<string, RecruiterScope | null>> {
  const out = new Map<string, RecruiterScope | null>();
  const assigned: string[] = [];
  for (const r of rows) {
    if (r.role !== 'recruiter') out.set(r.id, null);
    else if (r.recruiterScope === 'all') out.set(r.id, { kind: 'all' });
    else assigned.push(r.id);
  }
  if (assigned.length === 0) return out;

  const links = await db
    .select({
      membershipId: memberAssignments.membershipId,
      listingId: memberAssignments.listingId,
      locationId: memberAssignments.locationId,
    })
    .from(memberAssignments)
    .where(inArray(memberAssignments.membershipId, assigned))
    .orderBy(asc(memberAssignments.createdAt), asc(memberAssignments.id));
  for (const id of assigned) out.set(id, { kind: 'assigned', listingIds: [], locationIds: [] });
  for (const l of links) {
    const scope = out.get(l.membershipId);
    if (scope?.kind !== 'assigned') continue;
    if (l.listingId) scope.listingIds.push(l.listingId);
    if (l.locationId) scope.locationIds.push(l.locationId);
  }
  return out;
}

/** Builds Members (display name, email and scope) from membership rows, keeping their order. */
export async function toMembers(db: DbOrTx, rows: readonly MembershipRow[]): Promise<Member[]> {
  const [people, scopes] = await Promise.all([
    getPeople(
      db,
      rows.map((r) => r.userId),
    ),
    scopesFor(db, rows),
  ]);
  return rows.map((r) => {
    const person = people.get(r.userId);
    return {
      membershipId: r.id,
      userId: r.userId,
      displayName: person?.displayName ?? null,
      email: person?.email ?? null,
      role: r.role,
      scope: scopes.get(r.id) ?? null,
      joinedAt: r.createdAt,
    };
  });
}

/** Live memberships of the org, oldest first. */
export async function liveMemberships(db: DbOrTx, orgId: string): Promise<MembershipRow[]> {
  return db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), isNull(orgMemberships.deletedAt)))
    .orderBy(asc(orgMemberships.createdAt), asc(orgMemberships.id));
}

/** The user's live membership in the org, or null. */
export async function liveMembershipOf(
  db: DbOrTx,
  orgId: string,
  userId: string,
): Promise<MembershipRow | null> {
  const [row] = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.orgId, orgId),
        eq(orgMemberships.userId, userId),
        isNull(orgMemberships.deletedAt),
      ),
    );
  return row ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A live membership by its id, only if it belongs to `orgId` (else null). */
export async function liveMembershipById(
  db: DbOrTx,
  orgId: string,
  membershipId: string,
  opts: { forUpdate?: boolean } = {},
): Promise<MembershipRow | null> {
  if (!UUID.test(membershipId)) return null;
  const query = db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.id, membershipId),
        eq(orgMemberships.orgId, orgId),
        isNull(orgMemberships.deletedAt),
      ),
    );
  const [row] = opts.forUpdate ? await query.for('update') : await query;
  return row ?? null;
}

/** The org's team: every live member with role, recruiter scope and when they joined. */
export async function listMembers(db: DbOrTx, orgId: string): Promise<Member[]> {
  return toMembers(db, await liveMemberships(db, orgId));
}

/** The user's membership in the org as a Member, or null when they aren't a live member. */
export async function getMember(db: DbOrTx, orgId: string, userId: string): Promise<Member | null> {
  const row = await liveMembershipOf(db, orgId, userId);
  if (!row) return null;
  const [member] = await toMembers(db, [row]);
  return member ?? null;
}
