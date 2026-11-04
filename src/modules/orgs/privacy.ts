// The orgs module's privacy hooks (SP2 spec section 10), registered by SP8 with its exporter
// and eraser. Organization data stays (it is retained under SP8's rules); the person's own
// memberships go, and their id is cleared from what they did for a team.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { orgInvitations, orgMemberships, organizations } from './schema';

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
