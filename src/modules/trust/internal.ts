// Helpers shared inside the trust module. Not exported from ./index.
//
// Operators are identity's table (app.operators, drizzle/0100_identity.sql). Routing needs to
// read their queues and shifts together with the trust module's own item counts, and to stamp
// `last_assigned_at` when it assigns an item, so these few statements use raw SQL against it
// rather than a deep import of identity's schema.
import { sql } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx, type Tx } from '@/lib/db';

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

export type ActiveOperator = {
  userId: string;
  role: 'owner' | 'operator';
  queues: string[];
  shiftStatus: 'on_shift' | 'away';
  displayName: string | null;
};

type OperatorRow = {
  user_id: string;
  role: 'owner' | 'operator';
  queues: string[] | string;
  shift_status: 'on_shift' | 'away';
  display_name: string | null;
};

/** postgres.js and PGlite both parse text[]; accept the literal form too, to be safe. */
function parseTextArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  const inner = value.replace(/^\{|\}$/g, '');
  return inner ? inner.split(',').map((v) => v.replace(/^"|"$/g, '')) : [];
}

function toOperator(row: OperatorRow): ActiveOperator {
  return {
    userId: row.user_id,
    role: row.role,
    queues: parseTextArray(row.queues),
    shiftStatus: row.shift_status,
    displayName: row.display_name,
  };
}

const operatorColumns = sql`o.user_id, o.role, o.queues, o.shift_status, u.display_name`;

/** An operator whose account isn't deleted, or null. */
export async function findOperator(db: DbOrTx, userId: string): Promise<ActiveOperator | null> {
  if (!isUuid(userId)) return null;
  const [row] = await queryRows<OperatorRow>(
    db,
    sql`
      select ${operatorColumns}
      from app.operators o
      join app.users u on u.id = o.user_id
      where o.user_id = ${userId}::uuid and u.deleted_at is null
    `,
  );
  return row ? toOperator(row) : null;
}

/** Operators (accounts not deleted) among `ids`, in no particular order. */
export async function findOperators(db: DbOrTx, ids: string[]): Promise<ActiveOperator[]> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return [];
  const rows = await queryRows<OperatorRow>(
    db,
    sql`
      select ${operatorColumns}
      from app.operators o
      join app.users u on u.id = o.user_id
      where u.deleted_at is null
        and o.user_id in (${sql.join(
          valid.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
    `,
  );
  return rows.map(toOperator);
}

/** Every Owner operator whose account isn't deleted. */
export async function activeOwners(db: DbOrTx): Promise<ActiveOperator[]> {
  const rows = await queryRows<OperatorRow>(
    db,
    sql`
      select ${operatorColumns}
      from app.operators o
      join app.users u on u.id = o.user_id
      where o.role = 'owner' and u.deleted_at is null
      order by o.user_id
    `,
  );
  return rows.map(toOperator);
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
  const rows = await queryRows<{ one: number }>(
    db,
    sql`
      select 1 as one
      from app.operators o
      join app.users u on u.id = o.user_id and u.deleted_at is null
      where true
        ${o.queue === undefined ? sql`` : sql`and (o.role = 'owner' or ${o.queue}::text = any (o.queues))`}
        ${o.onShift ? sql`and o.shift_status = 'on_shift'` : sql``}
        ${excludeOperators(exclude)}
      limit 1
    `,
  );
  return rows.length > 0;
}

/** Owners match every queue; other operators only the queues they are assigned. */
export function coversQueue(op: Pick<ActiveOperator, 'role' | 'queues'>, queue: string): boolean {
  return op.role === 'owner' || op.queues.includes(queue);
}

/** Records that `userId` was just given an item, for routing's tie-break. */
export async function touchOperator(db: DbOrTx, userId: string, at: Date): Promise<void> {
  await db.execute(
    sql`update app.operators set last_assigned_at = ${at}::timestamptz where user_id = ${userId}::uuid`,
  );
}

/** `and o.user_id not in (...)` for the valid ids in `exclude`, or nothing. */
export function excludeOperators(exclude: readonly (string | null | undefined)[]) {
  const valid = [...new Set(exclude.filter(isUuid))];
  if (valid.length === 0) return sql``;
  return sql`and o.user_id not in (${sql.join(
    valid.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}
