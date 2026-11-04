// Test data for the trust module's tests. Not exported from ./index; never imported by app code.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';

export type OperatorFixture = {
  role?: 'owner' | 'operator';
  queues?: string[];
  shift?: 'on_shift' | 'away';
  lastAssignedAt?: Date | null;
  displayName?: string;
};

const textArray = (values: string[]) => `{${values.map((v) => `"${v}"`).join(',')}}`;

/** Creates an operator account (app.users plus app.operators) and returns its user id. */
export async function addOperator(db: DbOrTx, o: OperatorFixture = {}): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${id}@ops.test`}, ${o.displayName ?? 'Operator'}, 'operator')
  `);
  await db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status, last_assigned_at)
    values (
      ${id},
      ${o.role ?? 'operator'},
      ${textArray(o.queues ?? [])}::text[],
      ${o.shift ?? 'on_shift'},
      ${o.lastAssignedAt ?? null}::timestamptz
    )
  `);
  return id;
}

export async function setShift(db: DbOrTx, userId: string, shift: 'on_shift' | 'away') {
  await db.execute(
    sql`update app.operators set shift_status = ${shift} where user_id = ${userId}::uuid`,
  );
}

/** Removes every row the trust tests create, operators included (the audit log is kept). */
export async function resetTrustTables(db: DbOrTx): Promise<void> {
  await db.execute(sql`delete from app.review_actions`);
  await db.execute(sql`delete from app.review_notes`);
  await db.execute(sql`update app.review_items set original_item_id = null`);
  await db.execute(sql`delete from app.review_items`);
  await db.execute(sql`delete from app.trust_checks`);
  await db.execute(sql`delete from app.operators`);
  await db.execute(sql`delete from app.users`);
  await db.execute(sql`delete from app.settings`);
}

export type ItemRow = {
  id: string;
  queue: string;
  status: string;
  subject_type: string;
  subject_id: string;
  assignee_operator_id: string | null;
  assigned_at: string | null;
  escalated_to: string | null;
  priority: number;
  sla_due_at: string;
  sla_breached_at: string | null;
  decided_by: string | null;
  original_item_id: string | null;
  resolution: string | null;
  resolved_at: string | null;
  check_id: string | null;
};

export async function getItem(db: DbOrTx, id: string): Promise<ItemRow> {
  const [row] = await queryRows<ItemRow>(
    db,
    sql`select * from app.review_items where id = ${id}::uuid`,
  );
  if (!row) throw new Error(`no review item ${id}`);
  return row;
}

export async function auditActions(db: DbOrTx, subjectId: string): Promise<string[]> {
  const rows = await queryRows<{ action: string }>(
    db,
    sql`select action from app.audit_events where subject_id = ${subjectId} order by id`,
  );
  return rows.map((r) => r.action);
}
