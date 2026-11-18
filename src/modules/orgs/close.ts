// Closing an organization and removing one membership on behalf of the privacy engine (SP8
// Plan decisions 6 and 10). Neither calls Clerk inside the transaction: the Clerk organization
// is deleted by a job, and an erased person's Clerk memberships go away with their Clerk user.
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import type { ClerkAdmin } from '@/modules/identity';
import { emit, enqueue } from '@/modules/jobs';
import { memberAssignments, orgMemberships, organizations } from './schema';

export const DELETE_CLERK_ORG_TOPIC = 'orgs.delete_clerk_org';
const CANCEL_SUBSCRIPTION_TOPIC = 'billing.cancel_subscription';

const transact = <T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  (db as Db).transaction(fn);

/**
 * Closes an organization whose only member is leaving: marks it deleted with no Owner, takes
 * its host page down (`hostpage.updated`), and queues the subscription's cancellation and the
 * Clerk organization's deletion. Its listings, locations and other content are erased by their
 * own modules. A second call changes nothing.
 */
export async function closeOrganization(
  db: DbOrTx,
  i: { orgId: string; actorUserId: string | null; reason: string },
): Promise<{ closed: boolean }> {
  return transact(db, async (tx) => {
    const [org] = await tx
      .select({ id: organizations.id, clerkOrgId: organizations.clerkOrgId })
      .from(organizations)
      .where(and(eq(organizations.id, i.orgId), isNull(organizations.deletedAt)))
      .for('update');
    if (!org) return { closed: false };

    await tx
      .update(organizations)
      .set({ deletedAt: new Date(), ownerUserId: null })
      .where(eq(organizations.id, org.id));
    await record(tx, {
      actorType: i.actorUserId ? 'user' : 'system',
      actorId: i.actorUserId,
      orgId: org.id,
      action: 'orgs.deleted',
      subjectType: 'organization',
      subjectId: org.id,
      data: { reason: i.reason },
    });
    await emit(tx, 'hostpage.updated', { orgId: org.id }, newId());
    await enqueue(tx, {
      topic: CANCEL_SUBSCRIPTION_TOPIC,
      payload: { orgId: org.id },
      dedupeKey: `cancel:${org.id}:close`,
    });
    await enqueue(tx, {
      topic: DELETE_CLERK_ORG_TOPIC,
      payload: { clerkOrgId: org.clerkOrgId },
      dedupeKey: `clerk_org_delete:${org.id}`,
    });
    return { closed: true };
  });
}

/**
 * Removes a live, non-owner member without a host acting: the membership is marked removed,
 * its assignments go, and `org.member_removed` hands their threads and interviews to the Owner.
 */
export async function eraseMembership(
  db: DbOrTx,
  i: { orgId: string; userId: string; reason: string },
): Promise<{ removed: boolean }> {
  return transact(db, async (tx) => {
    const [membership] = await tx
      .select({ id: orgMemberships.id, role: orgMemberships.role })
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, i.orgId),
          eq(orgMemberships.userId, i.userId),
          isNull(orgMemberships.deletedAt),
        ),
      )
      .for('update');
    if (!membership || membership.role === 'owner') return { removed: false };

    await tx
      .update(orgMemberships)
      .set({ deletedAt: new Date() })
      .where(eq(orgMemberships.id, membership.id));
    await tx.delete(memberAssignments).where(eq(memberAssignments.membershipId, membership.id));
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: i.orgId,
      action: 'orgs.member_removed',
      subjectType: 'org_membership',
      subjectId: membership.id,
      data: { reason: i.reason, role: membership.role },
    });

    const [org] = await tx
      .select({ ownerUserId: organizations.ownerUserId })
      .from(organizations)
      .where(eq(organizations.id, i.orgId));
    if (org?.ownerUserId) {
      await emit(
        tx,
        'org.member_removed',
        { orgId: i.orgId, userId: i.userId, reassignToUserId: org.ownerUserId },
        newId(),
      );
    }
    return { removed: true };
  });
}

const deleteClerkOrgPayload = z.object({ clerkOrgId: z.string().min(1) });

/** The `orgs.delete_clerk_org` job. An organization Clerk no longer has is done. */
export async function deleteClerkOrgJob(
  payload: unknown,
  deps: { clerk?: ClerkAdmin } = {},
): Promise<void> {
  const { clerkOrgId } = deleteClerkOrgPayload.parse(payload);
  const clerk = deps.clerk ?? (await import('@/modules/identity')).clerkAdmin();
  try {
    await clerk.deleteOrganization(clerkOrgId);
  } catch (err) {
    const gone = typeof err === 'object' && err !== null && 'status' in err && err.status === 404;
    if (!gone) throw err;
  }
}
