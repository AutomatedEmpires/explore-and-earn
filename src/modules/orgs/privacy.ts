// The orgs module's privacy hooks (SP2 spec section 10), registered by SP8 with its exporter
// and eraser. Organization data stays (it is retained under SP8's rules); the person's own
// memberships go, and their id is cleared from what they did for a team.
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import type { EraseResult, ExportPart, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { closeOrganization, eraseMembership } from './close';
import { getPeople } from './people';
import {
  foundingCohort,
  memberAssignments,
  orgInvitations,
  orgMemberships,
  orgSlugs,
  organizations,
} from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  /** The user's memberships (removed ones too) and the invitations they sent. */
  async export(db, userId) {
    const memberships = await db
      .select({
        orgId: orgMemberships.orgId,
        orgName: organizations.name,
        role: orgMemberships.role,
        recruiterScope: orgMemberships.recruiterScope,
        joinedAt: orgMemberships.createdAt,
        removedAt: orgMemberships.deletedAt,
      })
      .from(orgMemberships)
      .innerJoin(organizations, eq(organizations.id, orgMemberships.orgId))
      .where(eq(orgMemberships.userId, userId))
      .orderBy(asc(orgMemberships.createdAt));
    const invitationsSent = await db
      .select({
        orgId: orgInvitations.orgId,
        email: orgInvitations.email,
        role: orgInvitations.role,
        status: orgInvitations.status,
        createdAt: orgInvitations.createdAt,
      })
      .from(orgInvitations)
      .where(eq(orgInvitations.invitedBy, userId))
      .orderBy(asc(orgInvitations.createdAt));
    return { memberships, invitationsSent };
  },

  /**
   * Hard-deletes the user's memberships (their assignments cascade) and clears their id from
   * the memberships and invitations they sent or accepted.
   */
  async erase(db, userId) {
    await db.transaction(async (tx) => {
      await tx.delete(orgMemberships).where(eq(orgMemberships.userId, userId));
      await tx
        .update(orgMemberships)
        .set({ invitedBy: null })
        .where(eq(orgMemberships.invitedBy, userId));
      await tx
        .update(orgInvitations)
        .set({ invitedBy: null })
        .where(eq(orgInvitations.invitedBy, userId));
      await tx
        .update(orgInvitations)
        .set({ acceptedUserId: null })
        .where(eq(orgInvitations.acceptedUserId, userId));
    });
  },
};

type Retained = EraseResult['retained'];

const exists = async (rows: Promise<unknown[]>) => (await rows).length > 0;

/** The membership and invitation rows that still name the person, by table. */
async function tablesNaming(db: DbOrTx, userId: string, email: string | null): Promise<string[]> {
  const memberships = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(or(eq(orgMemberships.userId, userId), eq(orgMemberships.invitedBy, userId)));
  const own = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));
  const assigned =
    own.length > 0 &&
    (await exists(
      db
        .select({ id: memberAssignments.id })
        .from(memberAssignments)
        .where(
          inArray(
            memberAssignments.membershipId,
            own.map((row) => row.id),
          ),
        )
        .limit(1),
    ));
  const invited = await exists(
    db
      .select({ id: orgInvitations.id })
      .from(orgInvitations)
      .where(
        or(
          eq(orgInvitations.invitedBy, userId),
          eq(orgInvitations.acceptedUserId, userId),
          email ? eq(orgInvitations.email, email) : undefined,
        ),
      )
      .limit(1),
  );
  return [
    ...(memberships.length > 0 ? ['org_memberships'] : []),
    ...(assigned ? ['member_assignments'] : []),
    ...(invited ? ['org_invitations'] : []),
  ];
}

async function eraseUser(tx: Tx, userId: string, holds: readonly string[]): Promise<EraseResult> {
  const email =
    (await getPeople(tx, [userId])).get(userId)?.email?.trim().toLowerCase() || null;
  if (holds.includes('all')) {
    const tables = await tablesNaming(tx, userId, email);
    return {
      erased: 0,
      retained: tables.map((table) => ({ table, reason: 'legal_hold', until: null })),
    };
  }

  // A member who is not the Owner leaves first, so their threads and interviews move to the
  // Owner. An Owner's row is only deleted: their organization is closed as its own subject.
  const live = await tx
    .select({ orgId: orgMemberships.orgId, role: orgMemberships.role })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), isNull(orgMemberships.deletedAt)));
  for (const membership of live.filter((m) => m.role !== 'owner')) {
    await eraseMembership(tx, { orgId: membership.orgId, userId, reason: 'account_deleted' });
  }

  // Foundation keeps removed memberships as tombstones. An erased person's rows go outright
  // (their assignments cascade); the Clerk-id tombstone keeps late events from bringing one back.
  const memberships = await tx
    .delete(orgMemberships)
    .where(eq(orgMemberships.userId, userId))
    .returning({ id: orgMemberships.id });
  const invitedMembers = await tx
    .update(orgMemberships)
    .set({ invitedBy: null })
    .where(eq(orgMemberships.invitedBy, userId))
    .returning({ id: orgMemberships.id });
  const sent = await tx
    .update(orgInvitations)
    .set({ invitedBy: null })
    .where(eq(orgInvitations.invitedBy, userId))
    .returning({ id: orgInvitations.id });
  const received = await tx
    .delete(orgInvitations)
    .where(
      or(
        eq(orgInvitations.acceptedUserId, userId),
        email ? eq(orgInvitations.email, email) : undefined,
      ),
    )
    .returning({ id: orgInvitations.id });
  return {
    erased: memberships.length + invitedMembers.length + sent.length + received.length,
    retained: [],
  };
}

async function eraseOrg(tx: Tx, orgId: string, holds: readonly string[]): Promise<EraseResult> {
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) return { erased: 0, retained: [] };

  const kept = async (reason: 'legal_hold' | 'shared_record'): Promise<Retained> => {
    const tables = ['organizations'];
    if (
      await exists(
        tx
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .where(eq(orgMemberships.orgId, orgId))
          .limit(1),
      )
    ) {
      tables.push('org_memberships');
    }
    if (
      await exists(
        tx
          .select({ id: memberAssignments.id })
          .from(memberAssignments)
          .innerJoin(orgMemberships, eq(orgMemberships.id, memberAssignments.membershipId))
          .where(eq(orgMemberships.orgId, orgId))
          .limit(1),
      )
    ) {
      tables.push('member_assignments');
    }
    if (
      await exists(
        tx
          .select({ id: orgInvitations.id })
          .from(orgInvitations)
          .where(eq(orgInvitations.orgId, orgId))
          .limit(1),
      )
    ) {
      tables.push('org_invitations');
    }
    if (
      await exists(
        tx.select({ slug: orgSlugs.slug }).from(orgSlugs).where(eq(orgSlugs.orgId, orgId)).limit(1),
      )
    ) {
      tables.push('org_slugs');
    }
    if (
      await exists(
        tx
          .select({ n: foundingCohort.foundingNumber })
          .from(foundingCohort)
          .where(eq(foundingCohort.orgId, orgId))
          .limit(1),
      )
    ) {
      tables.push('founding_cohort');
    }
    return tables.map((table) => ({ table, reason, until: null }));
  };

  if (holds.includes('all')) return { erased: 0, retained: await kept('legal_hold') };

  const { closed } = await closeOrganization(tx, {
    orgId,
    actorUserId: null,
    reason: 'account_deleted',
  });
  const assignments = await tx
    .delete(memberAssignments)
    .where(
      inArray(
        memberAssignments.membershipId,
        tx.select({ id: orgMemberships.id }).from(orgMemberships).where(eq(orgMemberships.orgId, orgId)),
      ),
    )
    .returning({ id: memberAssignments.id });
  const memberships = await tx
    .update(orgMemberships)
    .set({ deletedAt: new Date() })
    .where(and(eq(orgMemberships.orgId, orgId), isNull(orgMemberships.deletedAt)))
    .returning({ id: orgMemberships.id });
  const invitations = await tx
    .delete(orgInvitations)
    .where(eq(orgInvitations.orgId, orgId))
    .returning({ id: orgInvitations.id });

  // The organization row, its slug history and its founding number stay: applications, audit
  // rows and the founding count point at them. The name is the business's, not the person's.
  return {
    erased: (closed ? 1 : 0) + assignments.length + memberships.length + invitations.length,
    retained: await kept('shared_record'),
  };
}

export const privacyHandler: PrivacyHandler = {
  module: 'orgs',
  tables: [
    'organizations',
    'org_memberships',
    'member_assignments',
    'org_invitations',
    'org_slugs',
    'founding_cohort',
  ],

  /** The person's memberships and the invitations they sent, without the invitees' addresses. */
  async exportData(db, s): Promise<ExportPart> {
    if (s.kind !== 'user') return { records: { memberships: [], invitationsSent: [] }, files: [] };
    const memberships = await db
      .select({
        orgName: organizations.name,
        role: orgMemberships.role,
        joinedAt: orgMemberships.createdAt,
      })
      .from(orgMemberships)
      .innerJoin(organizations, eq(organizations.id, orgMemberships.orgId))
      .where(eq(orgMemberships.userId, s.userId))
      .orderBy(asc(orgMemberships.createdAt), asc(orgMemberships.id));
    const invitationsSent = await db
      .select({
        role: orgInvitations.role,
        status: orgInvitations.status,
        date: orgInvitations.createdAt,
      })
      .from(orgInvitations)
      .where(eq(orgInvitations.invitedBy, s.userId))
      .orderBy(asc(orgInvitations.createdAt), asc(orgInvitations.id));
    return { records: { memberships, invitationsSent }, files: [] };
  },

  erase(tx, s, ctx) {
    return s.kind === 'user' ? eraseUser(tx, s.userId, ctx.holds) : eraseOrg(tx, s.orgId, ctx.holds);
  },
};
export const retentionRules: RetentionRule[] = [];
