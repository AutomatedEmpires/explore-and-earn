// Team invitations and seats (SP2 spec sections 5, 8.1 and 10).
//
// - Seats: every live member and every unexpired pending invitation holds one. The counter is
//   registered with entitlements when this file loads, so withCapacity can re-count under the
//   org lock.
// - Tokens: an invitation is created without one. The `orgs.send_invitation` job generates the
//   token, stores only its sha256 hash and emails it with sendEmailNow in one step, so the raw
//   token never reaches app.outbox, a log or a column (SP2 plan decision 9). A failed send
//   throws, and the retry issues a fresh token; the failed one was never delivered.
// - Accepting checks everything that can fail before the account type is set (it never changes
//   afterwards), then writes the membership, then adds it in Clerk, undoing the membership if
//   Clerk refuses.
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { getCapacity, lockOrg, registerUsageCounter, withCapacity } from '@/modules/entitlements';
import type { ClerkAdmin, ClerkOrgRole, CurrentUser } from '@/modules/identity';
import { enqueue } from '@/modules/jobs';
import { sendEmailNow } from '@/modules/notifications';
import { getSetting } from '@/modules/settings';
import type { HostContext } from '@/server/guards';
import { recruiterScopeSchema } from './json';
import { notifyOwnerAdmins, ROLE_LABELS } from './notifications';
import { getPeople, personLabel, userIdsWithEmail } from './people';
import { requireCapability, type RecruiterScope } from './roles';
import { INVITATION_ROLES, orgInvitations, orgMemberships, organizations } from './schema';
import { replaceAssignments, storedScope } from './scope';

export const SEND_INVITATION_TOPIC = 'orgs.send_invitation';

export type InvitationRole = (typeof INVITATION_ROLES)[number];

export type Invitation = {
  id: string;
  /** Lowercased. */
  email: string;
  role: InvitationRole;
  /** Set for Recruiter invitations only. */
  scope: RecruiterScope | null;
  status: 'pending' | 'accepted' | 'revoked';
  /** Pending, and past `expiresAt`. */
  expired: boolean;
  expiresAt: Date;
  /** Null once the inviter's account is erased. */
  invitedBy: string | null;
  createdAt: Date;
};

type InvitationRow = typeof orgInvitations.$inferSelect;

const SEEKER_MESSAGE =
  'This email belongs to a seeker account. Ask for an invitation to a different email.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 32 random bytes in base64url are 43 characters; anything far from that is no token. */
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// --- Seats -----------------------------------------------------------------------------------

/** Seats in use: live memberships plus pending invitations that haven't expired. */
export async function countSeats(db: DbOrTx, orgId: string): Promise<number> {
  const [row] = await queryRows<{ used: number }>(
    db,
    sql`select
          (select count(*) from app.org_memberships
            where org_id = ${orgId} and deleted_at is null)::int
        + (select count(*) from app.org_invitations
            where org_id = ${orgId} and status = 'pending' and expires_at > now())::int
          as used`,
  );
  return row?.used ?? 0;
}

registerUsageCounter('seat', countSeats);

// --- Reading ---------------------------------------------------------------------------------

function scopeOf(row: InvitationRow): RecruiterScope | null {
  if (row.role !== 'recruiter') return null;
  if (row.recruiterScope === 'all') return { kind: 'all' };
  return { kind: 'assigned', listingIds: row.assignListingIds, locationIds: row.assignLocationIds };
}

function toInvitation(row: InvitationRow, now = new Date()): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    scope: scopeOf(row),
    status: row.status,
    expired: row.status === 'pending' && row.expiresAt <= now,
    expiresAt: row.expiresAt,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt,
  };
}

/** The org's pending invitations (expired ones included, flagged), newest first. */
export async function listInvitations(db: DbOrTx, orgId: string): Promise<Invitation[]> {
  const rows = await db
    .select()
    .from(orgInvitations)
    .where(and(eq(orgInvitations.orgId, orgId), eq(orgInvitations.status, 'pending')))
    .orderBy(desc(orgInvitations.createdAt), desc(orgInvitations.id));
  const now = new Date();
  return rows.map((r) => toInvitation(r, now));
}

/** `maya@kettle.com` -> `ma***@kettle.com`; a local part under 3 characters keeps 1. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return `${email.slice(0, 1)}***`;
  const local = email.slice(0, at);
  const keep = local.length < 3 ? 1 : 2;
  return `${local.slice(0, keep)}***@${email.slice(at + 1)}`;
}

export function toClerkRole(role: InvitationRole): ClerkOrgRole {
  return `org:${role}`;
}

type TokenMatch = InvitationRow & {
  orgName: string;
  clerkOrgId: string;
  orgDeleted: boolean;
};

async function findByToken(db: DbOrTx, token: string): Promise<TokenMatch | null> {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  const [row] = await db
    .select({
      invitation: orgInvitations,
      orgName: organizations.name,
      clerkOrgId: organizations.clerkOrgId,
      orgDeletedAt: organizations.deletedAt,
    })
    .from(orgInvitations)
    .innerJoin(organizations, eq(organizations.id, orgInvitations.orgId))
    .where(eq(orgInvitations.tokenHash, sha256(token)));
  if (!row) return null;
  return {
    ...row.invitation,
    orgName: row.orgName,
    clerkOrgId: row.clerkOrgId,
    orgDeleted: row.orgDeletedAt !== null,
  };
}

/**
 * What the join page shows for a token: null for an unknown, revoked or accepted token (or a
 * deleted org). An expired invitation is returned with its past `expiresAt`.
 */
export async function previewInvitation(
  db: DbOrTx,
  token: string,
): Promise<{
  orgId: string;
  orgName: string;
  role: InvitationRole;
  expiresAt: Date;
  emailHint: string;
} | null> {
  const inv = await findByToken(db, token);
  if (!inv || inv.status !== 'pending' || inv.orgDeleted) return null;
  return {
    orgId: inv.orgId,
    orgName: inv.orgName,
    role: inv.role,
    expiresAt: inv.expiresAt,
    emailHint: maskEmail(inv.email),
  };
}

// --- Inviting --------------------------------------------------------------------------------

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email('Enter a valid email address')),
  role: z.enum(INVITATION_ROLES),
  scope: recruiterScopeSchema.optional(),
});

export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

/**
 * Invites `email` to the caller's org (Owner or Admin). The email is lowercased; a live member
 * with that email is 409 `already_member`, and a pending invitation to it is replaced. Runs
 * inside `withCapacity(seat, 1)`. The row has no token yet: it enqueues `orgs.send_invitation`
 * (dedupe `invite:<id>`), which creates and sends one. Records `orgs.member_invited`. The caller
 * checks that assigned listings and locations belong to the org, and calls `kickWorker()`.
 */
export async function createInvitation(
  db: DbOrTx,
  ctx: HostContext,
  i: { email: string; role: InvitationRole; scope?: RecruiterScope },
): Promise<Invitation> {
  requireCapability(ctx, 'team.manage');
  const parsed = createInvitationSchema.safeParse(i);
  if (!parsed.success) throw badRequest('Invalid invitation', parsed.error.issues);
  const { email, role } = parsed.data;
  const scope = storedScope(role, parsed.data.scope);

  const row = await db.transaction(async (tx) => {
    await lockOrg(tx, ctx.orgId);

    const userIds = await userIdsWithEmail(tx, email);
    if (userIds.length > 0) {
      const [member] = await tx
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(
          and(
            eq(orgMemberships.orgId, ctx.orgId),
            inArray(orgMemberships.userId, userIds),
            isNull(orgMemberships.deletedAt),
          ),
        )
        .limit(1);
      if (member) {
        throw conflict('This person is already on your team', { reason: 'already_member' });
      }
    }

    // Replacing a pending invitation frees its seat before the new one is counted.
    const replaced = await tx
      .update(orgInvitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(orgInvitations.orgId, ctx.orgId),
          eq(orgInvitations.email, email),
          eq(orgInvitations.status, 'pending'),
        ),
      )
      .returning({ id: orgInvitations.id });

    return withCapacity(tx, ctx.orgId, 'seat', 1, async () => {
      const ttlDays = await getSetting(tx, 'team.invitation_ttl_days');
      const [inserted] = await tx
        .insert(orgInvitations)
        .values({
          id: newId(),
          orgId: ctx.orgId,
          email,
          role,
          recruiterScope: scope.recruiterScope,
          assignListingIds: scope.listingIds,
          assignLocationIds: scope.locationIds,
          tokenHash: null,
          status: 'pending',
          expiresAt: sql`now() + make_interval(days => ${ttlDays}::int)`,
          invitedBy: ctx.user.id,
        })
        .returning();
      if (!inserted) throw new Error('createInvitation: insert returned no row');

      await enqueue(tx, {
        topic: SEND_INVITATION_TOPIC,
        payload: { invitationId: inserted.id },
        dedupeKey: `invite:${inserted.id}`,
      });
      await record(tx, {
        actorType: 'user',
        actorId: ctx.user.id,
        orgId: ctx.orgId,
        action: 'orgs.member_invited',
        subjectType: 'org_invitation',
        subjectId: inserted.id,
        data: {
          email,
          role,
          scope: scope.recruiterScope,
          ...(replaced.length > 0 ? { replacedInvitationIds: replaced.map((r) => r.id) } : {}),
        },
      });
      return inserted;
    });
  });
  return toInvitation(row);
}

/** Revokes a pending invitation of the caller's org. Records `orgs.invitation_revoked`. */
export async function revokeInvitation(db: DbOrTx, ctx: HostContext, id: string): Promise<void> {
  requireCapability(ctx, 'team.manage');
  if (!UUID.test(id)) throw notFound('Invitation not found');
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(orgInvitations)
      .where(and(eq(orgInvitations.id, id), eq(orgInvitations.orgId, ctx.orgId)))
      .for('update');
    if (!row) throw notFound('Invitation not found');
    if (row.status === 'revoked') return;
    if (row.status === 'accepted') {
      throw conflict('This invitation was already accepted', { reason: 'already_accepted' });
    }
    await tx.update(orgInvitations).set({ status: 'revoked' }).where(eq(orgInvitations.id, id));
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: ctx.orgId,
      action: 'orgs.invitation_revoked',
      subjectType: 'org_invitation',
      subjectId: id,
      data: { email: row.email, role: row.role },
    });
  });
}

// --- Sending (the orgs.send_invitation job) ---------------------------------------------------

const sendPayload = z.object({ invitationId: z.uuid() });

function joinUrl(token: string): string {
  return `${getEnv().APP_URL.replace(/\/+$/, '')}/join/${token}`;
}

/**
 * Handles `orgs.send_invitation`: for a pending, unexpired invitation, creates a fresh token,
 * stores its hash (committed before sending) and emails the accept link. Anything else sends
 * nothing. A send failure throws (with the token kept out of the message), so the job retries.
 */
export async function sendInvitationJob(
  db: Db,
  payload: unknown,
  now: Date,
): Promise<'sent' | 'suppressed' | 'skipped'> {
  const parsed = sendPayload.safeParse(payload);
  if (!parsed.success) throw new Error('orgs.send_invitation: invalid payload');
  const { invitationId } = parsed.data;

  const [row] = await db
    .select({
      invitation: orgInvitations,
      orgName: organizations.name,
      orgDeletedAt: organizations.deletedAt,
    })
    .from(orgInvitations)
    .innerJoin(organizations, eq(organizations.id, orgInvitations.orgId))
    .where(eq(orgInvitations.id, invitationId));
  const inv = row?.invitation;
  if (!row || !inv || inv.status !== 'pending' || inv.expiresAt <= now || row.orgDeletedAt) {
    return 'skipped';
  }

  const token = randomBytes(32).toString('base64url');
  const stored = await db
    .update(orgInvitations)
    .set({ tokenHash: sha256(token) })
    .where(and(eq(orgInvitations.id, inv.id), eq(orgInvitations.status, 'pending')))
    .returning({ id: orgInvitations.id });
  if (stored.length === 0) return 'skipped';

  const inviter = inv.invitedBy
    ? (await getPeople(db, [inv.invitedBy])).get(inv.invitedBy)
    : undefined;
  try {
    return await sendEmailNow(db, {
      to: inv.email,
      template: 'TeamInvite',
      category: 'account',
      data: {
        orgName: row.orgName,
        inviterName: personLabel(inviter, 'Someone on the team'),
        role: ROLE_LABELS[inv.role],
        acceptUrl: joinUrl(token),
        expiresAt: inv.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Sending the invitation email failed: ${reason.replaceAll(token, '[token]')}`);
  }
}

// --- Accepting -------------------------------------------------------------------------------

function sameEmail(a: string | null, b: string): boolean {
  return a !== null && a.trim().toLowerCase() === b;
}

/** Under the org lock: 409 `seat_limit` when the org already uses more seats than it has. */
async function assertSeatsFit(tx: Tx, orgId: string): Promise<void> {
  await lockOrg(tx, orgId);
  const { limit, used } = await getCapacity(tx, orgId, 'seat');
  if (used > limit) {
    throw conflict('This team has no free seats', { reason: 'seat_limit', limit, used });
  }
}

type Joined = {
  membershipId: string;
  /** The membership row existed (removed earlier) and was brought back. */
  revived: boolean;
} | null;

/**
 * Accepts an invitation for the signed-in user, in this order:
 * 1. a seeker account gets 409 `seeker_account`;
 * 2. an unknown, revoked or never-sent token gets 404, and another email (compared ignoring
 *    letter case) 403 `email_mismatch`;
 * 3. an expired invitation gets 409 `expired`;
 * 4. a team over its seat limit gets 409 `seat_limit`;
 * 5. only then does a user without an account type become a host;
 * 6. the membership (with its assignments) is written, the invitation accepted and audited;
 * 7. Clerk adds the membership; if it fails, the membership is undone, the invitation goes
 *    back to pending and this throws `internal`;
 * 8. the Owner and Admins are told.
 * Accepting an invitation this user already accepted just returns the redirect.
 */
export async function acceptInvitation(
  db: Db,
  clerk: ClerkAdmin,
  user: CurrentUser,
  token: string,
): Promise<{ redirectTo: '/host' }> {
  if (user.accountType === 'seeker') throw conflict(SEEKER_MESSAGE, { reason: 'seeker_account' });
  if (user.accountType === 'operator') {
    throw forbidden("Operator accounts can't join a host team", { reason: 'wrong_account_type' });
  }

  const inv = await findByToken(db, token);
  if (!inv || inv.orgDeleted) throw notFound('Invitation not found');
  if (inv.status === 'accepted' && inv.acceptedUserId === user.id) return { redirectTo: '/host' };
  if (inv.status !== 'pending') throw notFound('Invitation not found');
  if (!sameEmail(user.email, inv.email)) {
    throw forbidden('This invitation was sent to a different email address', {
      reason: 'email_mismatch',
    });
  }
  const expired = () =>
    conflict('This invitation has expired. Ask for a new one.', { reason: 'expired' });
  if (inv.expiresAt <= new Date()) throw expired();
  await db.transaction((tx) => assertSeatsFit(tx, inv.orgId));

  if (user.accountType === null) await becomeHost(db, clerk, user.id);

  const joined: Joined = await db.transaction(async (tx) => {
    await assertSeatsFit(tx, inv.orgId);
    const [current] = await tx
      .select()
      .from(orgInvitations)
      .where(eq(orgInvitations.id, inv.id))
      .for('update');
    if (current?.status === 'accepted' && current.acceptedUserId === user.id) return null;
    if (!current || current.status !== 'pending') throw notFound('Invitation not found');
    if (current.expiresAt <= new Date()) throw expired();

    const [existing] = await tx
      .select()
      .from(orgMemberships)
      .where(and(eq(orgMemberships.orgId, inv.orgId), eq(orgMemberships.userId, user.id)))
      .for('update');
    if (existing && existing.deletedAt === null) {
      throw conflict("You're already on this team", { reason: 'already_member' });
    }

    let membershipId: string;
    if (existing) {
      membershipId = existing.id;
      await tx
        .update(orgMemberships)
        .set({ role: current.role, invitedBy: current.invitedBy, deletedAt: null })
        .where(eq(orgMemberships.id, existing.id));
    } else {
      membershipId = newId();
      await tx.insert(orgMemberships).values({
        id: membershipId,
        orgId: inv.orgId,
        userId: user.id,
        role: current.role,
        invitedBy: current.invitedBy,
      });
    }
    await replaceAssignments(tx, membershipId, current.role, scopeOf(current));

    await tx
      .update(orgInvitations)
      .set({ status: 'accepted', acceptedUserId: user.id })
      .where(eq(orgInvitations.id, inv.id));
    await record(tx, {
      actorType: 'user',
      actorId: user.id,
      orgId: inv.orgId,
      action: 'orgs.invitation_accepted',
      subjectType: 'org_invitation',
      subjectId: inv.id,
      data: { role: current.role, membershipId },
    });
    return { membershipId, revived: existing !== undefined };
  });
  if (joined === null) return { redirectTo: '/host' };

  try {
    await clerk.addMembership(inv.clerkOrgId, user.clerkUserId, toClerkRole(inv.role));
  } catch (err) {
    await undoJoin(db, inv.id, joined);
    throw new AppError(
      'internal',
      "We couldn't add you to the team just now. Try again in a few minutes.",
      undefined,
      { cause: err },
    );
  }

  const person = (await getPeople(db, [user.id])).get(user.id);
  await notifyOwnerAdmins(
    db,
    inv.orgId,
    'orgs.member_joined',
    {
      memberName: personLabel(person, user.email ?? 'Someone'),
      role: inv.role,
      orgName: inv.orgName,
    },
    { exceptUserId: user.id },
  );
  return { redirectTo: '/host' };
}

/** Sets the account type to host; a second request that already did so (a double click) is fine. */
async function becomeHost(db: Db, clerk: ClerkAdmin, userId: string): Promise<void> {
  // Identity imports this module, so it is loaded when first needed (no evaluation cycle).
  const { setAccountType } = await import('@/modules/identity');
  try {
    await setAccountType(db, clerk, userId, { accountType: 'host' });
  } catch (err) {
    const now = (await getPeople(db, [userId])).get(userId)?.accountType;
    if (now === 'host') return;
    if (now === 'seeker') throw conflict(SEEKER_MESSAGE, { reason: 'seeker_account' });
    throw err;
  }
}

/** Compensates a join that Clerk refused: no live membership, the invitation pending again. */
async function undoJoin(db: Db, invitationId: string, joined: NonNullable<Joined>): Promise<void> {
  await db.transaction(async (tx) => {
    if (joined.revived) {
      await replaceAssignments(tx, joined.membershipId, 'billing', null);
      await tx
        .update(orgMemberships)
        .set({ deletedAt: new Date() })
        .where(eq(orgMemberships.id, joined.membershipId));
    } else {
      await tx.delete(orgMemberships).where(eq(orgMemberships.id, joined.membershipId));
    }
    await tx
      .update(orgInvitations)
      .set({ status: 'pending', acceptedUserId: null })
      .where(eq(orgInvitations.id, invitationId));
  });
}
