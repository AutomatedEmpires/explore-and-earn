// Lookups of users and operators for other modules. app.users and app.operators belong to this
// module, so everything outside it reads and writes them only through these functions (typed,
// so a schema change here fails typecheck where it matters instead of at runtime).
import { and, asc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { type AccountType, type OperatorRole, operators, users } from './schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validIds = (ids: readonly (string | null | undefined)[]): string[] => [
  ...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id))),
];

/** What another module may know about a user: how to reach them, and whether they still exist. */
export type UserContact = {
  id: string;
  clerkUserId: string;
  accountType: AccountType | null;
  email: string | null;
  displayName: string | null;
  deleted: boolean;
};

/** A user by our id (deleted ones included, flagged), or null. */
export async function getUserContact(db: DbOrTx, userId: string): Promise<UserContact | null> {
  if (!UUID.test(userId)) return null;
  const [row] = await db
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      accountType: users.accountType,
      email: users.email,
      displayName: users.displayName,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return null;
  const { deletedAt, ...rest } = row;
  return { ...rest, deleted: deletedAt !== null };
}

/** An operator whose account isn't deleted. */
export type ActiveOperator = {
  userId: string;
  role: OperatorRole;
  queues: string[];
  shiftStatus: 'on_shift' | 'away';
  /** When review routing last gave them an item; null if never. */
  lastAssignedAt: Date | null;
  displayName: string | null;
};

export type OperatorFilter = {
  /** Only these user ids. */
  ids?: readonly (string | null | undefined)[];
  /** Never these user ids. */
  exclude?: readonly (string | null | undefined)[];
  role?: OperatorRole;
  /** Only operators covering this queue: Owners cover every queue, others their assigned ones. */
  queue?: string;
  /** Only operators on shift. */
  onShift?: boolean;
};

/** Operators whose accounts aren't deleted, matching `f`, ordered by user id. */
export async function listActiveOperators(
  db: DbOrTx,
  f: OperatorFilter = {},
): Promise<ActiveOperator[]> {
  const ids = f.ids === undefined ? undefined : validIds(f.ids);
  if (ids?.length === 0) return [];
  const exclude = validIds(f.exclude ?? []);

  return db
    .select({
      userId: operators.userId,
      role: operators.role,
      queues: operators.queues,
      shiftStatus: operators.shiftStatus,
      lastAssignedAt: operators.lastAssignedAt,
      displayName: users.displayName,
    })
    .from(operators)
    .innerJoin(users, eq(users.id, operators.userId))
    .where(
      and(
        isNull(users.deletedAt),
        ids ? inArray(operators.userId, ids) : undefined,
        exclude.length > 0 ? notInArray(operators.userId, exclude) : undefined,
        f.role ? eq(operators.role, f.role) : undefined,
        f.queue === undefined
          ? undefined
          : or(eq(operators.role, 'owner'), sql`${f.queue}::text = any (${operators.queues})`),
        f.onShift ? eq(operators.shiftStatus, 'on_shift') : undefined,
      ),
    )
    .orderBy(asc(operators.userId));
}

/** Records that review routing just gave `userId` an item (its round-robin tie-break). */
export async function markOperatorAssigned(db: DbOrTx, userId: string, at: Date): Promise<void> {
  if (!UUID.test(userId)) return;
  await db.update(operators).set({ lastAssignedAt: at }).where(eq(operators.userId, userId));
}
