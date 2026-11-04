// Changing and removing team members, and transferring ownership (SP2 spec sections 5, 8.1).
// The Owner can't leave without transferring; Admins can't change or remove the Owner; an
// ownership transfer goes only to an existing Admin. Clerk calls run last inside the
// transaction, so a Clerk failure leaves everything here unchanged.
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import type { ClerkAdmin } from '@/modules/identity';
import { emit } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import type { HostContext } from '@/server/guards';
import { toClerkRole, type InvitationRole } from './invitations';
import { recruiterScopeSchema } from './json';
import { getMember, liveMembershipById, scopesFor } from './members';
import { getPeople, personLabel } from './people';
import { requireCapability, type Member, type RecruiterScope } from './roles';
import { INVITATION_ROLES, memberAssignments, organizations, orgMemberships } from './schema';
import { replaceAssignments } from './scope';

const notOwnerMessage = "Admins can't change or remove the Owner";

async function loadOrg(db: DbOrTx, orgId: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      clerkOrgId: organizations.clerkOrgId,
      ownerUserId: organizations.ownerUserId,
    })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .for('update');
  if (!org) throw notFound('Organization not found');
  return org;
}

function sameScope(a: RecruiterScope | null, b: RecruiterScope | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'all' || b.kind === 'all') return true;
  const same = (x: string[], y: string[]) =>
    x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return same(a.listingIds, b.listingIds) && same(a.locationIds, b.locationIds);
}

/** PATCH /host/team/members/[id] input. */
export const changeMemberSchema = z.object({
  role: z.enum(INVITATION_ROLES).optional(),
  scope: recruiterScopeSchema.optional(),
});

/**
 * Changes a member's role and/or recruiter scope (Owner or Admin). Admins can't change the
 * Owner, and the Owner's own role changes only by transferring ownership. A role change is also
 * made in Clerk. Records `orgs.member_changed` and tells the member. The caller checks that an
 * assigned scope names only the org's own listings and locations.
 */
export async function changeMember(
  db: DbOrTx,
  clerk: ClerkAdmin,
  ctx: HostContext,
  membershipId: string,
  i: { role?: InvitationRole; scope?: RecruiterScope },
): Promise<Member> {
  requireCapability(ctx, 'team.manage');
  const parsed = changeMemberSchema.safeParse(i);
  if (!parsed.success) throw badRequest('Invalid member change', parsed.error.issues);
  const input = parsed.data;

  const change = await db.transaction(async (tx) => {
    const org = await loadOrg(tx, ctx.orgId);
    const target = await liveMembershipById(tx, ctx.orgId, membershipId, { forUpdate: true });
    if (!target) throw notFound('Member not found');
    if (target.role === 'owner') {
      if (ctx.role !== 'owner') throw forbidden(notOwnerMessage, { reason: 'role_not_allowed' });
      if (input.role !== undefined) {
        throw conflict('Transfer ownership to an Admin before you change your own role', {
          reason: 'owner_must_transfer',
        });
      }
      return null;
    }

    const before = (await scopesFor(tx, [target])).get(target.id) ?? null;
    const role = input.role ?? target.role;
    const roleChanged = role !== target.role;
    const scope: RecruiterScope | null =
      role !== 'recruiter' ? null : (input.scope ?? (roleChanged ? { kind: 'all' } : before));
    const scopeChanged = !sameScope(before, scope);
    if (!roleChanged && !scopeChanged) return null;

    if (roleChanged) {
      await tx.update(orgMemberships).set({ role }).where(eq(orgMemberships.id, target.id));
    }
    await replaceAssignments(tx, target.id, role, scope);
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'orgs.member_changed',
      subjectType: 'org_membership',
      subjectId: target.id,
      data: {
        userId: target.userId,
        from: { role: target.role, scope: before?.kind ?? null },
        to: { role, scope: scope?.kind ?? null },
      },
    });
    if (roleChanged) {
      const person = (await getPeople(tx, [target.userId])).get(target.userId);
      if (person) {
        await clerk.updateMembershipRole(org.clerkOrgId, person.clerkUserId, toClerkRole(role));
      }
    }
    return { orgName: org.name, userId: target.userId, role, roleChanged };
  });

  if (change && change.userId !== ctx.user.id) {
    const actor = (await getPeople(db, [ctx.user.id])).get(ctx.user.id);
    await notify(db, change.userId, 'orgs.member_changed', {
      orgName: change.orgName,
      role: change.role,
      roleChanged: change.roleChanged,
      actorName: personLabel(actor, 'An Admin'),
      buttonLabel: 'Open Explore&Earn',
    });
  }

  const target = await liveMembershipById(db, ctx.orgId, membershipId);
  const member = target ? await getMember(db, ctx.orgId, target.userId) : null;
  if (!member) throw notFound('Member not found');
  return member;
}

/**
 * Removes a member (Owner or Admin), or lets a member leave. The Owner leaving is 409
 * `owner_must_transfer`; nobody else may remove the Owner. Sets `deleted_at`, drops the
 * member's assignments, removes them in Clerk, records `orgs.member_removed` and emits
 * `org.member_removed`, whose `reassignToUserId` is the acting member, or the Owner when
 * someone leaves on their own. The caller calls `kickWorker()` after commit.
 */
export async function removeMember(
  db: DbOrTx,
  clerk: ClerkAdmin,
  ctx: HostContext,
  membershipId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const org = await loadOrg(tx, ctx.orgId);
    const target = await liveMembershipById(tx, ctx.orgId, membershipId, { forUpdate: true });
    if (!target) throw notFound('Member not found');
    const self = target.userId === ctx.user.id;
    if (target.role === 'owner') {
      if (self) {
        throw conflict('Transfer ownership to an Admin before you leave', {
          reason: 'owner_must_transfer',
        });
      }
      throw forbidden(notOwnerMessage, { reason: 'role_not_allowed' });
    }
    if (!self) requireCapability(ctx, 'team.manage');

    await tx
      .update(orgMemberships)
      .set({ deletedAt: new Date() })
      .where(eq(orgMemberships.id, target.id));
    await tx.delete(memberAssignments).where(eq(memberAssignments.membershipId, target.id));
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'orgs.member_removed',
      subjectType: 'org_membership',
      subjectId: target.id,
      data: { userId: target.userId, role: target.role, left: self },
    });
    const reassignToUserId = self ? (org.ownerUserId ?? ctx.user.id) : ctx.user.id;
    await emit(
      tx,
      'org.member_removed',
      { orgId: ctx.orgId, userId: target.userId, reassignToUserId },
      newId(),
    );

    const person = (await getPeople(tx, [target.userId])).get(target.userId);
    if (person) await clerk.removeMembership(org.clerkOrgId, person.clerkUserId);
  });
}

/**
 * Makes an Admin the Owner (the Owner only; the route also requires reverification). The
 * former Owner becomes an Admin, so exactly one Owner remains. Clerk needs no change: Owner
 * and Admins share `org:admin` there. Records `orgs.ownership_transferred` and tells both.
 */
export async function transferOwnership(
  db: DbOrTx,
  ctx: HostContext,
  membershipId: string,
): Promise<void> {
  requireCapability(ctx, 'org.transfer');
  const done = await db.transaction(async (tx) => {
    const org = await loadOrg(tx, ctx.orgId);
    const target = await liveMembershipById(tx, ctx.orgId, membershipId, { forUpdate: true });
    if (!target) throw notFound('Member not found');
    if (target.role !== 'admin') {
      throw conflict('Ownership can only go to an Admin', { reason: 'target_not_admin' });
    }

    await tx
      .update(organizations)
      .set({ ownerUserId: target.userId })
      .where(eq(organizations.id, org.id));
    await tx
      .update(orgMemberships)
      .set({ role: 'admin' })
      .where(and(eq(orgMemberships.orgId, org.id), eq(orgMemberships.role, 'owner')));
    await tx.update(orgMemberships).set({ role: 'owner' }).where(eq(orgMemberships.id, target.id));
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: org.id,
      action: 'orgs.ownership_transferred',
      subjectType: 'organization',
      subjectId: org.id,
      data: { fromUserId: org.ownerUserId, toUserId: target.userId },
    });
    return { orgName: org.name, previousOwnerId: ctx.user.id, newOwnerId: target.userId };
  });

  const people = await getPeople(db, [done.previousOwnerId, done.newOwnerId]);
  const data = {
    orgName: done.orgName,
    previousOwnerName: personLabel(people.get(done.previousOwnerId), 'The previous Owner'),
    newOwnerName: personLabel(people.get(done.newOwnerId), 'An Admin'),
    buttonLabel: 'Open your team',
  };
  await notify(db, done.newOwnerId, 'orgs.ownership_transferred', { ...data, you: 'new' });
  await notify(db, done.previousOwnerId, 'orgs.ownership_transferred', {
    ...data,
    you: 'previous',
  });
}
