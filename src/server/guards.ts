// Server-side guards for pages, server actions and API routes. Permissions come from our
// database (roles, memberships, operator queues), never from anything the client sends; Clerk
// supplies only who is signed in, which organization is active and how they signed in.
//
// Each guard throws AppError: `unauthorized` when nobody is signed in, `forbidden` otherwise.
// A `forbidden` carries `details: GuardDenial`. Page callers redirect on `details.redirectTo`:
// a host who needs strong sign-in goes to /host/security, an operator without a passkey to
// /admin/passkey and a user who hasn't onboarded to /onboarding.
import { auth, currentUser } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { forbidden, unauthorized } from '@/lib/errors';
import {
  evaluateHostAccess,
  evaluateOperatorAccess,
  findUserByClerkId,
  getOperator,
  syncClerkUser,
  userHasPasskey,
  userHasStrongAuth,
  type CurrentUser,
  type OrgRole,
} from '@/modules/identity';
import { findHostMembership } from '@/modules/orgs';

export type { CurrentUser, OrgRole };

export type HostContext = { user: CurrentUser; orgId: string; role: OrgRole };

export type OperatorContext = {
  user: CurrentUser;
  role: 'owner' | 'operator';
  queues: string[];
};

/** Clerk reverification preset for sensitive operator actions: within the last 10 minutes. */
export const SENSITIVE_REVERIFICATION = 'strict';

/** `details` of a guard's `forbidden` error. */
export type GuardDenial =
  | { reason: 'needs_onboarding'; redirectTo: '/onboarding' }
  | { reason: 'wrong_account_type' }
  | { reason: 'not_a_member' }
  | { reason: 'role_not_allowed' }
  | { reason: 'needs_strong_auth'; redirectTo: '/host/security' }
  | { reason: 'not_an_operator' }
  | { reason: 'queue_not_assigned' }
  | { reason: 'needs_passkey'; redirectTo: '/admin/passkey' }
  | { reason: 'reverification_required'; reverification: typeof SENSITIVE_REVERIFICATION };

function deny(message: string, details: GuardDenial) {
  return forbidden(message, details);
}

/** The signed-in Clerk user as the Backend API returns it (for passkey and two-step checks). */
async function clerkUserJson() {
  return (await currentUser())?.raw ?? null;
}

/**
 * The signed-in user. If Clerk's webhook for a new user hasn't arrived yet (or can't, as with
 * keyless development), the user is provisioned from Clerk's Backend API, the same way.
 */
export async function requireUser(): Promise<CurrentUser> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw unauthorized();

  const db = getDb();
  let user = await findUserByClerkId(db, clerkUserId);
  if (!user) {
    const raw = await clerkUserJson();
    if (!raw) throw unauthorized();
    await syncClerkUser(db, raw);
    user = await findUserByClerkId(db, clerkUserId);
  }
  if (!user || user.deletedAt) throw unauthorized('Account not found');

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    accountType: user.accountType,
    email: user.email,
  };
}

function requireAccountType(user: CurrentUser, type: 'seeker' | 'host'): void {
  if (user.accountType === type) return;
  if (user.accountType === null) {
    throw deny('Choose an account type first', {
      reason: 'needs_onboarding',
      redirectTo: '/onboarding',
    });
  }
  throw deny(`This needs a ${type} account`, { reason: 'wrong_account_type' });
}

export async function requireSeeker(): Promise<CurrentUser> {
  const user = await requireUser();
  requireAccountType(user, 'seeker');
  return user;
}

/**
 * A host member of the session's active organization (or, with none active, of their oldest
 * organization), optionally limited to `roles`. Owners and Admins also need a passkey or
 * two-step sign-in.
 */
export async function requireHost(opts?: { roles?: OrgRole[] }): Promise<HostContext> {
  const user = await requireUser();
  requireAccountType(user, 'host');

  const { orgId: activeClerkOrgId } = await auth();
  const membership = await findHostMembership(getDb(), user.id, activeClerkOrgId ?? null);
  const role = membership?.role ?? null;
  const strongAuth =
    role === 'owner' || role === 'admin' ? userHasStrongAuth(await clerkUserJson()) : false;

  const access = evaluateHostAccess({ role, strongAuth, required: opts?.roles });
  if (!membership) {
    throw deny('Not a member of this organization', { reason: 'not_a_member' });
  }
  if (access === 'forbidden') {
    throw deny('Your role in this organization does not allow this', {
      reason: 'role_not_allowed',
    });
  }
  if (access === 'needs_strong_auth') {
    throw deny('Set up a passkey or two-step sign-in to continue', {
      reason: 'needs_strong_auth',
      redirectTo: '/host/security',
    });
  }
  return { user, orgId: membership.orgId, role: membership.role };
}

/**
 * An operator with a passkey, optionally assigned to `queue` (Owners cover every queue).
 * With `sensitive`, the operator must also have reverified with Clerk in the last 10 minutes.
 */
export async function requireOperator(opts?: {
  queue?: string;
  sensitive?: boolean;
}): Promise<OperatorContext> {
  const user = await requireUser();
  const operator = user.accountType === 'operator' ? await getOperator(getDb(), user.id) : null;
  // ALLOW_OPERATOR_WITHOUT_PASSKEY (never in prod, src/lib/env.ts) is for Clerk development
  // instances where passkeys are not enabled, such as keyless mode in local and e2e runs.
  const hasPasskey = operator
    ? getEnv().ALLOW_OPERATOR_WITHOUT_PASSKEY || userHasPasskey(await clerkUserJson())
    : false;

  const access = evaluateOperatorAccess({ operator, hasPasskey, queue: opts?.queue });
  if (!operator) throw deny('Operators only', { reason: 'not_an_operator' });
  if (access === 'forbidden') {
    throw deny('This queue is not assigned to you', { reason: 'queue_not_assigned' });
  }
  if (access === 'needs_passkey') {
    throw deny('Register a passkey to use the console', {
      reason: 'needs_passkey',
      redirectTo: '/admin/passkey',
    });
  }

  if (opts?.sensitive) {
    const { has } = await auth();
    if (!has({ reverification: SENSITIVE_REVERIFICATION })) {
      throw deny('Confirm it is you to continue', {
        reason: 'reverification_required',
        reverification: SENSITIVE_REVERIFICATION,
      });
    }
  }

  return { user, role: operator.role, queues: operator.queues };
}
