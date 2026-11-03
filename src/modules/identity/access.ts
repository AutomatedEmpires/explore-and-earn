// Access rules for hosts and operators (pure), plus the lookups the guards need.
//
// - Host Owners and Admins need a passkey or two-step sign-in; Recruiters and Billing don't.
// - Operators always need a passkey. Owners cover every queue; other operators only theirs.
// - A role or queue refusal is reported before a missing sign-in method, so nobody is sent to set
//   up a passkey only to be refused afterwards.
import { and, count, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict } from '@/lib/errors';
import type { CurrentUser, OrgRole } from './index';
import type { ClerkAdmin } from './clerk-admin';
import { type OperatorRole, operators, users } from './schema';

export type HostAccess = 'ok' | 'needs_strong_auth' | 'forbidden';
export type OperatorAccess = 'ok' | 'needs_passkey' | 'forbidden';

export function evaluateHostAccess(i: {
  role: OrgRole | null;
  strongAuth: boolean;
  required?: OrgRole[];
}): HostAccess {
  if (i.role === null) return 'forbidden';
  if (i.required && !i.required.includes(i.role)) return 'forbidden';
  if ((i.role === 'owner' || i.role === 'admin') && !i.strongAuth) return 'needs_strong_auth';
  return 'ok';
}

export function evaluateOperatorAccess(i: {
  operator: { role: 'owner' | 'operator'; queues: string[] } | null;
  hasPasskey: boolean;
  queue?: string;
}): OperatorAccess {
  if (!i.operator) return 'forbidden';
  if (
    i.queue !== undefined &&
    i.operator.role !== 'owner' &&
    !i.operator.queues.includes(i.queue)
  ) {
    return 'forbidden';
  }
  if (!i.hasPasskey) return 'needs_passkey';
  return 'ok';
}

export type UserRecord = CurrentUser & { deletedAt: Date | null };

export async function findUserByClerkId(
  db: DbOrTx,
  clerkUserId: string,
): Promise<UserRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      accountType: users.accountType,
      email: users.email,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  return row ?? null;
}

export type OperatorRecord = {
  role: OperatorRole;
  queues: string[];
  shiftStatus: 'on_shift' | 'away';
};

export async function getOperator(db: DbOrTx, userId: string): Promise<OperatorRecord | null> {
  const [row] = await db
    .select({ role: operators.role, queues: operators.queues, shiftStatus: operators.shiftStatus })
    .from(operators)
    .where(eq(operators.userId, userId));
  return row ?? null;
}

/** Operators whose accounts aren't deleted, optionally only those with `role`. */
export async function countOperators(
  db: DbOrTx,
  opts: { role?: OperatorRole } = {},
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(operators)
    .innerJoin(users, eq(users.id, operators.userId))
    .where(and(isNull(users.deletedAt), opts.role ? eq(operators.role, opts.role) : undefined));
  return row?.n ?? 0;
}

/**
 * Invites the first operator Owner (`pnpm ops:bootstrap-owner <email>`). Refuses with conflict
 * once an Owner exists; after that, Owners invite operators from the console.
 */
export async function bootstrapOwnerInvite(
  db: DbOrTx,
  clerk: ClerkAdmin,
  email: string,
): Promise<{ email: string }> {
  const parsed = z.email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) throw badRequest('Invalid email address', parsed.error.issues);
  if ((await countOperators(db, { role: 'owner' })) > 0) {
    throw conflict('An operator Owner already exists; invite operators from the console');
  }
  await clerk.inviteOperator(parsed.data, 'owner');
  return { email: parsed.data };
}
