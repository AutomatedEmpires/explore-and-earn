// The console's Operators page: who the operators are, the queues they cover and whether they
// are on shift, and the Owner-only invitation of new operators.
//
// Operators are identity's table (app.operators). Their queues and shift are console settings
// the console changes, so these few statements use raw SQL against it (as the trust module's
// routing does) rather than a deep import of identity's schema. Each change is audited.
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, withTx, type Db, type DbOrTx } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import { getOperator, type ClerkAdmin, type OperatorInviteRole } from '@/modules/identity';
import { QUEUES, type Queue } from '@/modules/trust';
import { epochMs, isUuid, personName, textArrayLiteral, toArray, toDate } from './rows';

export type ShiftStatus = 'on_shift' | 'away';

export type OperatorSummary = {
  userId: string;
  name: string;
  email: string | null;
  role: 'owner' | 'operator';
  /** The queues assigned to them. Owners cover every queue whatever this says. */
  queues: Queue[];
  shiftStatus: ShiftStatus;
  /** Items they hold (assigned or escalated). */
  inHand: number;
  lastAssignedAt: Date | null;
};

/** Every operator whose account isn't deleted: Owners first, then by name. */
export async function listOperators(db: DbOrTx): Promise<OperatorSummary[]> {
  const rows = await queryRows<{
    user_id: string;
    display_name: string | null;
    email: string | null;
    role: 'owner' | 'operator';
    queues: string[] | string;
    shift_status: ShiftStatus;
    in_hand: number;
    last_assigned_ms: number | string | null;
  }>(
    db,
    sql`
      select o.user_id, u.display_name, u.email, o.role, o.queues, o.shift_status,
        (
          select count(*)::int from app.review_items r
          where r.assignee_operator_id = o.user_id and r.status in ('assigned', 'escalated')
        ) as in_hand,
        ${epochMs(sql`o.last_assigned_at`)} as last_assigned_ms
      from app.operators o
      join app.users u on u.id = o.user_id
      where u.deleted_at is null
      order by (o.role = 'owner') desc, lower(coalesce(u.display_name, u.email, '')), o.user_id
    `,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    name: personName(r.display_name, r.email),
    email: r.email,
    role: r.role,
    queues: toArray(r.queues).filter((q): q is Queue => (QUEUES as readonly string[]).includes(q)),
    shiftStatus: r.shift_status,
    inHand: r.in_hand,
    lastAssignedAt: toDate(r.last_assigned_ms),
  }));
}

async function requireOwner(db: DbOrTx, actorId: string, what: string): Promise<void> {
  const actor = isUuid(actorId) ? await getOperator(db, actorId) : null;
  if (!actor) throw forbidden('Only operators can do this');
  if (actor.role !== 'owner') throw forbidden(`Only an Owner can ${what}`);
}

async function requireTarget(db: DbOrTx, userId: string) {
  const target = isUuid(userId) ? await getOperator(db, userId) : null;
  if (!target) throw notFound('Operator not found');
  return target;
}

const queuesSchema = z.array(z.enum(QUEUES)).max(QUEUES.length);

/** Sets the queues an operator covers. Owner only. Records `operator.queues_updated`. */
export async function setOperatorQueues(
  db: Db,
  actorId: string,
  userId: string,
  queues: readonly string[],
): Promise<void> {
  const parsed = queuesSchema.safeParse([...new Set(queues)]);
  if (!parsed.success) throw badRequest('Unknown queue', parsed.error.issues);
  const next = QUEUES.filter((q) => parsed.data.includes(q));

  await withTx(db, async (tx) => {
    await requireOwner(tx, actorId, 'change the queues an operator covers');
    const target = await requireTarget(tx, userId);
    await tx.execute(sql`
      update app.operators set queues = ${textArrayLiteral(next)}::text[]
      where user_id = ${userId}::uuid
    `);
    await record(tx, {
      actorType: 'operator',
      actorId,
      action: 'operator.queues_updated',
      subjectType: 'operator',
      subjectId: userId,
      data: { previous: target.queues, queues: next },
    });
  });
}

/**
 * Puts an operator on shift or away. Operators set their own shift; an Owner may set anyone's.
 * Records `operator.shift_changed` when it changes.
 */
export async function setShiftStatus(
  db: Db,
  actorId: string,
  userId: string,
  status: ShiftStatus,
): Promise<void> {
  if (status !== 'on_shift' && status !== 'away') throw badRequest('Unknown shift status');
  await withTx(db, async (tx) => {
    if (actorId !== userId) await requireOwner(tx, actorId, "change another operator's shift");
    const target = await requireTarget(tx, userId);
    if (target.shiftStatus === status) return;
    await tx.execute(sql`
      update app.operators set shift_status = ${status} where user_id = ${userId}::uuid
    `);
    await record(tx, {
      actorType: 'operator',
      actorId,
      action: 'operator.shift_changed',
      subjectType: 'operator',
      subjectId: userId,
      data: { previous: target.shiftStatus, shiftStatus: status },
    });
  });
}

const inviteSchema = z.object({
  email: z.email().max(254),
  role: z.enum(['owner', 'operator']),
});

/**
 * Emails a Clerk invitation that makes whoever accepts it an operator with `role`. Owner only.
 * Records `operator.invited`.
 */
export async function inviteOperator(
  db: Db,
  clerk: ClerkAdmin,
  actorId: string,
  i: { email: string; role: OperatorInviteRole },
): Promise<{ email: string }> {
  const parsed = inviteSchema.safeParse({ email: i.email.trim().toLowerCase(), role: i.role });
  if (!parsed.success) throw badRequest('Enter a valid email address', parsed.error.issues);
  await requireOwner(db, actorId, 'invite operators');

  await clerk.inviteOperator(parsed.data.email, parsed.data.role);
  await record(db, {
    actorType: 'operator',
    actorId,
    action: 'operator.invited',
    subjectType: 'operator_invitation',
    subjectId: null,
    data: { email: parsed.data.email, role: parsed.data.role },
  });
  return { email: parsed.data.email };
}
