// Server-side guards for pages, server actions and API routes. Permissions come from our
// database (roles, memberships, operator queues), never from anything the client sends; Clerk
// supplies only who is signed in, which organization is active and how they signed in.
//
// Each guard throws AppError: `unauthorized` when nobody is signed in, `forbidden` otherwise.
// A `forbidden` carries `details: GuardDenial`. Page callers redirect on `details.redirectTo`:
// a host who needs strong sign-in goes to /host/security, an operator without a passkey to
// /admin/passkey and a user who hasn't onboarded to /onboarding.
import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { forbidden, unauthorized } from '@/lib/errors';
import { isPerfMode, perfUserFromHeader } from '@/lib/perf-mode';
import {
  evaluateHostAccess,
  evaluateOperatorAccess,
  findUserByClerkId,
  findUserById,
  getOperator,
  syncClerkUser,
  userHasPasskey,
  userHasStrongAuth,
  type CurrentUser,
  type OrgRole,
  type UserRecord,
} from '@/modules/identity';
import { getActiveSanction } from '@/modules/operator';
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
  | {
      reason: 'reverification_required';
      reverification:
        | typeof SENSITIVE_REVERIFICATION
        | { level: 'first_factor'; afterMinutes: number };
    };

function deny(message: string, details: GuardDenial) {
  return forbidden(message, details);
}

/** The signed-in Clerk user as the Backend API returns it (for passkey and two-step checks). */
async function clerkUserJson() {
  return (await currentUser())?.raw ?? null;
}

function toCurrentUser(user: UserRecord): CurrentUser {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    accountType: user.accountType,
    email: user.email,
  };
}

async function assertNotSuspended(userId: string): Promise<void> {
  const sanction = await getActiveSanction(getDb(), { userId });
  if (sanction) {
    throw unauthorized('Your account is suspended', { reason: 'account_suspended' });
  }
}

/**
 * The signed-in user. If Clerk's webhook for a new user hasn't arrived yet (or can't, as with
 * keyless development), the user is provisioned from Clerk's Backend API, the same way.
 * In perf mode a valid `x-perf-user` header selects that user without Clerk.
 */
export async function requireUser(): Promise<CurrentUser> {
  const env = getEnv();
  if (isPerfMode(env)) {
    const header = (await headers()).get('x-perf-user');
    const userId = perfUserFromHeader(header, env);
    if (userId) {
      const user = await findUserById(getDb(), userId);
      if (!user || user.deletedAt) throw unauthorized('Account not found');
      await assertNotSuspended(user.id);
      return toCurrentUser(user);
    }
  }

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
  await assertNotSuspended(user.id);

  return toCurrentUser(user);
}

/**
 * Confirms the session was reverified within `maxAgeSec` (default 10 minutes). Clerk's `has`
 * speaks in whole minutes, so the window is rounded up.
 */
export async function requireRecentAuth(maxAgeSec = 600): Promise<void> {
  const afterMinutes = Math.ceil(maxAgeSec / 60);
  const { has } = await auth();
  if (!has({ reverification: { level: 'first_factor', afterMinutes } })) {
    throw forbidden('Confirm it is you to continue', {
      reason: 'reverification_required',
      reverification: { level: 'first_factor', afterMinutes },
    });
  }
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

  const perf = isPerfMode(getEnv());
  const activeClerkOrgId = perf ? null : ((await auth()).orgId ?? null);
  const membership = await findHostMembership(getDb(), user.id, activeClerkOrgId);
  const role = membership?.role ?? null;
  const strongAuth = perf
    ? true
    : role === 'owner' || role === 'admin'
      ? userHasStrongAuth(await clerkUserJson())
      : false;

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
