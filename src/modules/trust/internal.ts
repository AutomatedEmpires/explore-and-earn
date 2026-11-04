// Helpers shared inside the trust module. Not exported from ./index.
//
// Operators are identity's table (app.operators), so routing reads and stamps them only
// through @/modules/identity, and counts each candidate's items in its own app.review_items.
import { and, count, inArray } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import {
  listActiveOperators,
  markOperatorAssigned,
  type ActiveOperator,
  type OperatorFilter,
} from '@/modules/identity';
import { reviewItems } from './schema';

export type { ActiveOperator } from '@/modules/identity';

/**
 * Runs `fn` in a transaction: a new one on a Db, or a savepoint inside the caller's
 * transaction, so the trust writes commit (or roll back) together either way.
 */
export function transact<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** An operator whose account isn't deleted, or null. */
export async function findOperator(db: DbOrTx, userId: string): Promise<ActiveOperator | null> {
  if (!isUuid(userId)) return null;
  const [op] = await listActiveOperators(db, { ids: [userId] });
  return op ?? null;
}

/** Operators (accounts not deleted) among `ids`, in no particular order. */
export function findOperators(db: DbOrTx, ids: string[]): Promise<ActiveOperator[]> {
  return listActiveOperators(db, { ids });
}

/** Every Owner operator whose account isn't deleted. */
export function activeOwners(db: DbOrTx): Promise<ActiveOperator[]> {
  return listActiveOperators(db, { role: 'owner' });
}

/**
 * Whether any operator (account not deleted) outside `exclude` exists. With `queue`, only
 * operators covering it count; with `onShift`, only operators on shift.
 */
export async function anyOperatorBesides(
  db: DbOrTx,
  exclude: readonly (string | null | undefined)[],
  o: { queue?: string; onShift?: boolean } = {},
): Promise<boolean> {
  return (await listActiveOperators(db, { ...o, exclude })).length > 0;
}

/** Owners match every queue; other operators only the queues they are assigned. */
export function coversQueue(op: Pick<ActiveOperator, 'role' | 'queues'>, queue: string): boolean {
  return op.role === 'owner' || op.queues.includes(queue);
}

/** Records that `userId` was just given an item, for routing's tie-break. */
export function touchOperator(db: DbOrTx, userId: string, at: Date): Promise<void> {
  return markOperatorAssigned(db, userId, at);
}

/**
 * The operator matching `filter` who holds the fewest assigned or escalated items, ties going
 * to whoever was assigned longest ago (never assigned first), then the lowest id. Null when
 * nobody matches.
 */
export async function leastLoadedOperator(
  db: DbOrTx,
  filter: OperatorFilter,
): Promise<string | null> {
  const candidates = await listActiveOperators(db, filter);
  if (candidates.length === 0) return null;

  const rows = await db
    .select({ operatorId: reviewItems.assigneeOperatorId, n: count() })
    .from(reviewItems)
    .where(
      and(
        inArray(
          reviewItems.assigneeOperatorId,
          candidates.map((c) => c.userId),
        ),
        inArray(reviewItems.status, ['assigned', 'escalated']),
      ),
    )
    .groupBy(reviewItems.assigneeOperatorId);
  const held = new Map(rows.map((r) => [r.operatorId, Number(r.n)]));

  const assignedAt = (op: ActiveOperator) => op.lastAssignedAt?.getTime() ?? -Infinity;
  const [best] = [...candidates].sort(
    (a, b) =>
      (held.get(a.userId) ?? 0) - (held.get(b.userId) ?? 0) ||
      assignedAt(a) - assignedAt(b) ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  return best?.userId ?? null;
}
