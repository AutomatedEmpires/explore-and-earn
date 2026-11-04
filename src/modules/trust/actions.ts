// What operators do with review items: claim, hand off, escalate, note, decide (with a second
// sign-off for bans and large refunds), and appeal a decision.
//
// Permissions here are the domain rules; the console's server actions also check the session
// with requireOperator. An operator may act on an item in a queue they cover (Owners cover
// every queue) that is unassigned or theirs; an Owner may act on any item. Two exceptions:
// - an item's excluded operators (an appeal's original decider and signer) may not claim,
//   decide or be handed it while another operator covering its queue is on shift, nor sign
//   off a decision on it while any other operator exists (spec section 8);
// - a second sign-off may come from any other operator, whatever queues they cover, so a
//   decision held for one never waits on nobody.
import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, type DbOrTx, type Tx } from '@/lib/db';
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { countOperators } from '@/modules/identity';
import { notify } from '@/modules/notifications';
import { getSetting } from '@/modules/settings';
import {
  anyOperatorBesides,
  coversQueue,
  excludeOperators,
  findOperator,
  findOperators,
  isUuid,
  touchOperator,
  transact,
  type ActiveOperator,
} from './internal';
import { openReviewItem } from './routing';
import { reviewActions, reviewItems, reviewNotes } from './schema';
import { findSubjectHandler, type SubjectHandler } from './subjects';
import { REVIEW_ACTIONS, type ReviewAction } from './types';

export type DecisionData = { amountCents?: number; note?: string };

type ItemRecord = typeof reviewItems.$inferSelect;

const MAX_NOTE_LENGTH = 5000;
const MAX_REASON_LENGTH = 2000;
const ESCALATION_PRIORITY = 100;

// --- Lookups ----------------------------------------------------------------------------------

async function loadItem(db: DbOrTx, itemId: string, lock: boolean): Promise<ItemRecord> {
  if (!isUuid(itemId)) throw notFound('Review item not found');
  const query = db.select().from(reviewItems).where(eq(reviewItems.id, itemId));
  const [item] = lock ? await query.for('update') : await query;
  if (!item) throw notFound('Review item not found');
  return item;
}

/** The acting operator, who must cover the item's queue. */
async function actingOperator(db: DbOrTx, operatorId: string, queue: string) {
  const op = await findOperator(db, operatorId);
  if (!op) throw forbidden('Only operators can do this');
  if (!coversQueue(op, queue)) throw forbidden(`You are not assigned to the ${queue} queue`);
  return op;
}

function assertMayAct(item: ItemRecord, op: ActiveOperator): void {
  if (item.assigneeOperatorId && item.assigneeOperatorId !== op.userId && op.role !== 'owner') {
    throw forbidden('Another operator holds this item');
  }
}

/**
 * Whether `userId` is kept off this item: they are in its exclusions (for an appeal, whoever
 * made or signed off the original decision) and someone else is available to do the job. That
 * is an on-shift operator outside the exclusions covering the item's queue: the spec routes an
 * appeal to another operator "when one is available", as routing and the SLA sweep count
 * availability. When nobody else is, an excluded operator may act, so the item never waits on
 * nobody. With `signOff`, any operator outside the exclusions and `besides`, on shift or not,
 * whatever queues they cover: a second sign-off waits for one by rule (needsSecondSignOff
 * counts operators that exist).
 */
async function keptOff(
  db: DbOrTx,
  item: ItemRecord,
  userId: string,
  o: { signOff?: boolean; besides?: string[] } = {},
): Promise<boolean> {
  if (!item.excludeOperatorIds.includes(userId)) return false;
  return anyOperatorBesides(
    db,
    [...item.excludeOperatorIds, ...(o.besides ?? [])],
    o.signOff ? {} : { queue: item.queue, onShift: true },
  );
}

const KEPT_OFF = 'You made or signed off the decision under appeal; another operator reviews it';

function assertOpen(item: ItemRecord): void {
  if (item.status === 'resolved') throw conflict('This item is already resolved');
}

async function requireHandler(subjectType: string, action: ReviewAction): Promise<SubjectHandler> {
  const handler = await findSubjectHandler(subjectType, action);
  if (!handler) throw badRequest(`"${action}" is not available for ${subjectType} items`);
  return handler;
}

// --- Notes and mentions -----------------------------------------------------------------------

const MENTION =
  /@\[([^\]\r\n]{1,100})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/** The operator ids mentioned as `@[Display Name](operator-uuid)`, in order, without repeats. */
export function parseMentions(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(MENTION)) {
    const id = match[2]?.toLowerCase();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** `@[name](id)` for a note body, with the characters that would break the token removed. */
function mentionToken(op: Pick<ActiveOperator, 'userId' | 'displayName'>): string {
  const name =
    (op.displayName ?? '')
      .replace(/[[\]\r\n]/g, ' ')
      .trim()
      .slice(0, 100) || 'Operator';
  return `@[${name}](${op.userId})`;
}

/** Stores a note; each mentioned operator (other than the author) gets `operator.mention`. */
async function insertNote(
  tx: DbOrTx,
  itemId: string,
  authorId: string,
  body: string,
): Promise<{ id: string; mentions: string[] }> {
  const candidates = parseMentions(body);
  const operators = new Set((await findOperators(tx, candidates)).map((o) => o.userId));
  const mentions = candidates.filter((id) => operators.has(id));

  const id = newId();
  await tx.insert(reviewNotes).values({ id, itemId, authorOperatorId: authorId, body, mentions });
  for (const userId of mentions) {
    if (userId !== authorId) await notify(tx, userId, 'operator.mention', { itemId });
  }
  return { id, mentions };
}

function cleanText(value: string | undefined, what: string, max: number): string {
  const text = (value ?? '').trim();
  if (!text) throw badRequest(`${what} is required`);
  if (text.length > max) throw badRequest(`${what} must be at most ${max} characters`);
  return text;
}

/**
 * Adds an internal note. `@[Display Name](operator-uuid)` tokens naming operators are stored in
 * `mentions`, and each mentioned operator is notified (`operator.mention`).
 */
export async function addNote(
  db: DbOrTx,
  itemId: string,
  operatorId: string,
  body: string,
): Promise<void> {
  const text = cleanText(body, 'A note', MAX_NOTE_LENGTH);
  await transact(db, async (tx) => {
    const item = await loadItem(tx, itemId, false);
    const op = await actingOperator(tx, operatorId, item.queue);
    const note = await insertNote(tx, item.id, op.userId, text);
    await record(tx, {
      actorType: 'operator',
      actorId: op.userId,
      action: 'trust.note_added',
      subjectType: 'review_item',
      subjectId: item.id,
      data: { noteId: note.id, mentions: note.mentions },
    });
  });
}

// --- Claim, hand off, escalate ----------------------------------------------------------------

/**
 * Takes an unassigned item (or confirms one already held). Atomic: when two operators claim at
 * once exactly one wins, and the other gets `conflict`. An excluded operator (see keptOff)
 * gets `forbidden`.
 */
export async function claim(db: DbOrTx, itemId: string, operatorId: string): Promise<void> {
  await transact(db, async (tx) => {
    const item = await loadItem(tx, itemId, false);
    assertOpen(item);
    const op = await actingOperator(tx, operatorId, item.queue);
    if (await keptOff(tx, item, op.userId)) throw forbidden(KEPT_OFF);
    if (item.assigneeOperatorId === op.userId) return;

    const now = new Date();
    const claimed = await tx
      .update(reviewItems)
      .set({
        assigneeOperatorId: op.userId,
        assignedAt: now,
        status: sql`case when ${reviewItems.status} = 'open' then 'assigned' else ${reviewItems.status} end`,
      })
      .where(
        and(
          eq(reviewItems.id, item.id),
          ne(reviewItems.status, 'resolved'),
          or(isNull(reviewItems.assigneeOperatorId), eq(reviewItems.assigneeOperatorId, op.userId)),
        ),
      )
      .returning({ id: reviewItems.id });
    if (claimed.length === 0) throw conflict('Another operator already holds this item');

    await touchOperator(tx, op.userId, now);
    await record(tx, {
      actorType: 'operator',
      actorId: op.userId,
      action: 'trust.claimed',
      subjectType: 'review_item',
      subjectId: item.id,
      data: { queue: item.queue },
    });
  });
}

/** Reassigns an item. Only its current holder, or an Owner, may hand it off. */
export async function handOff(
  db: DbOrTx,
  itemId: string,
  fromOperatorId: string,
  toOperatorId: string,
): Promise<void> {
  await transact(db, async (tx) => {
    const item = await loadItem(tx, itemId, true);
    assertOpen(item);
    const from = await findOperator(tx, fromOperatorId);
    if (!from) throw forbidden('Only operators can do this');
    if (item.assigneeOperatorId !== from.userId && from.role !== 'owner') {
      throw forbidden('Only the operator holding the item, or an Owner, can hand it off');
    }
    if (toOperatorId === item.assigneeOperatorId) throw badRequest('Choose a different operator');
    const to = await findOperator(tx, toOperatorId);
    if (!to) throw badRequest('Hand off to an operator');
    if (!coversQueue(to, item.queue)) {
      throw badRequest(`That operator is not assigned to the ${item.queue} queue`);
    }
    if (await keptOff(tx, item, to.userId)) {
      throw badRequest('That operator made or signed off the decision under appeal');
    }

    const now = new Date();
    await tx
      .update(reviewItems)
      .set({
        assigneeOperatorId: to.userId,
        assignedAt: now,
        status: item.status === 'open' ? 'assigned' : item.status,
      })
      .where(eq(reviewItems.id, item.id));
    await touchOperator(tx, to.userId, now);
    await record(tx, {
      actorType: 'operator',
      actorId: from.userId,
      action: 'trust.handed_off',
      subjectType: 'review_item',
      subjectId: item.id,
      data: { queue: item.queue, from: item.assigneeOperatorId, to: to.userId },
    });
  });
}

/** The Owner holding the fewest assigned or escalated items (then: assigned longest ago). */
async function leastLoadedOwner(
  db: DbOrTx,
  exclude: readonly (string | null)[],
): Promise<string | null> {
  const [row] = await queryRows<{ user_id: string }>(
    db,
    sql`
      select o.user_id
      from app.operators o
      join app.users u on u.id = o.user_id and u.deleted_at is null
      cross join lateral (
        select count(*)::int as n
        from app.review_items r
        where r.assignee_operator_id = o.user_id and r.status in ('assigned', 'escalated')
      ) held
      where o.role = 'owner'
        ${excludeOperators(exclude)}
      order by held.n, o.last_assigned_at asc nulls first, o.user_id
      limit 1
    `,
  );
  return row?.user_id ?? null;
}

/**
 * Escalates an item, with a reason, to a named operator or (by default) to the Owner with the
 * fewest open items. The item becomes `escalated`, jumps the queue (priority + 100), and gets a
 * note mentioning the new holder, who is notified.
 */
export async function escalate(
  db: DbOrTx,
  itemId: string,
  fromOperatorId: string,
  i: { toOperatorId?: string; reason: string },
): Promise<void> {
  const reason = cleanText(i.reason, 'A reason', MAX_REASON_LENGTH);
  await transact(db, async (tx) => {
    const item = await loadItem(tx, itemId, true);
    assertOpen(item);
    const from = await actingOperator(tx, fromOperatorId, item.queue);
    assertMayAct(item, from);

    let targetId: string | null;
    if (i.toOperatorId !== undefined) {
      if (i.toOperatorId === from.userId) throw badRequest('Escalate to someone else');
      const named = await findOperator(tx, i.toOperatorId);
      if (!named) throw badRequest('Escalate to an operator');
      if (!coversQueue(named, item.queue)) {
        throw badRequest(`That operator is not assigned to the ${item.queue} queue`);
      }
      if (await keptOff(tx, item, named.userId)) {
        throw badRequest('That operator made or signed off the decision under appeal');
      }
      targetId = named.userId;
    } else {
      // An excluded Owner (an appeal's original decider) only when they could act on it.
      targetId = await leastLoadedOwner(tx, [from.userId, ...item.excludeOperatorIds]);
      if (!targetId) {
        const fallback = await leastLoadedOwner(tx, [from.userId]);
        if (fallback && !(await keptOff(tx, item, fallback))) targetId = fallback;
      }
      if (!targetId) throw conflict('No other Owner is available to escalate to');
    }
    const target = await findOperator(tx, targetId);
    if (!target) throw badRequest('Escalate to an operator');

    const now = new Date();
    await tx
      .update(reviewItems)
      .set({
        status: 'escalated',
        priority: sql`${reviewItems.priority} + ${ESCALATION_PRIORITY}`,
        escalatedTo: target.userId,
        assigneeOperatorId: target.userId,
        assignedAt: now,
      })
      .where(eq(reviewItems.id, item.id));
    await touchOperator(tx, target.userId, now);
    await insertNote(tx, item.id, from.userId, `Escalated to ${mentionToken(target)}: ${reason}`);
    await record(tx, {
      actorType: 'operator',
      actorId: from.userId,
      action: 'trust.escalated',
      subjectType: 'review_item',
      subjectId: item.id,
      data: { queue: item.queue, from: item.assigneeOperatorId, to: target.userId, reason },
    });
  });
}

// --- Decisions --------------------------------------------------------------------------------

const decisionData = z.strictObject({
  amountCents: z.number().int().positive().optional(),
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
});

function parseDecision(action: ReviewAction, data: DecisionData | undefined): DecisionData {
  if (!(REVIEW_ACTIONS as readonly string[]).includes(action)) {
    throw badRequest(`Unknown action: ${String(action)}`);
  }
  const parsed = decisionData.safeParse(data ?? {});
  if (!parsed.success) throw badRequest('Invalid decision data', parsed.error.issues);
  const out: DecisionData = {};
  if (parsed.data.amountCents !== undefined) out.amountCents = parsed.data.amountCents;
  const note = parsed.data.note?.trim();
  if (note) out.note = note;
  if (action === 'refund' && out.amountCents === undefined) {
    throw badRequest('A refund needs amountCents');
  }
  return out;
}

/** A ban, or a refund above `ops.second_signoff_refund_cents`, once 2+ operators exist. */
async function needsSecondSignOff(
  db: DbOrTx,
  action: ReviewAction,
  amountCents: number | undefined,
): Promise<boolean> {
  const large =
    action === 'ban' ||
    (action === 'refund' &&
      (amountCents ?? 0) > (await getSetting(db, 'ops.second_signoff_refund_cents')));
  return large && (await countOperators(db)) >= 2;
}

/** Runs the subject handler, resolves the item and records `trust.decided`, all in `tx`. */
async function applyDecision(
  tx: Tx,
  item: ItemRecord,
  a: {
    actionId: string;
    action: ReviewAction;
    data: DecisionData;
    handler: SubjectHandler;
    decidedBy: string;
    appliedBy: string;
    secondOperatorId: string | null;
  },
): Promise<void> {
  // Handlers learn which item decided them (a subject with two open items needs both approved).
  await a.handler(tx, item.subjectId, { ...a.data, reviewItemId: item.id });

  const now = new Date();
  await tx
    .update(reviewItems)
    .set({
      status: 'resolved',
      resolution: a.action,
      resolvedAt: now,
      decidedBy: a.decidedBy,
      assigneeOperatorId: item.assigneeOperatorId ?? a.decidedBy,
      assignedAt: item.assignedAt ?? now,
    })
    .where(eq(reviewItems.id, item.id));

  await record(tx, {
    actorType: 'operator',
    actorId: a.appliedBy,
    action: 'trust.decided',
    subjectType: 'review_item',
    subjectId: item.id,
    data: {
      queue: item.queue,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      decision: a.action,
      actionId: a.actionId,
      decidedBy: a.decidedBy,
      secondOperatorId: a.secondOperatorId,
      ...(a.data.amountCents !== undefined ? { amountCents: a.data.amountCents } : {}),
      originalItemId: item.originalItemId,
    },
  });
}

/**
 * Decides an item. A ban, or a refund over `ops.second_signoff_refund_cents`, waits for a
 * second, different operator (`pending_second`, see approveSecond) once 2+ operators exist.
 * Otherwise the subject handler runs, the item is resolved with `decided_by`, and
 * `trust.decided` is recorded, in one transaction. A `note` is stored as an internal note.
 */
export async function decide(
  db: DbOrTx,
  itemId: string,
  operatorId: string,
  action: ReviewAction,
  data?: DecisionData,
): Promise<{ status: 'applied' | 'pending_second' }> {
  const d = parseDecision(action, data);
  return transact(db, async (tx) => {
    const item = await loadItem(tx, itemId, true);
    assertOpen(item);
    const op = await actingOperator(tx, operatorId, item.queue);
    assertMayAct(item, op);
    if (await keptOff(tx, item, op.userId)) throw forbidden(KEPT_OFF);
    const handler = await requireHandler(item.subjectType, action);

    const [pending] = await tx
      .select({ id: reviewActions.id })
      .from(reviewActions)
      .where(and(eq(reviewActions.itemId, item.id), eq(reviewActions.status, 'pending_second')))
      .limit(1);
    if (pending) throw conflict('A decision on this item is waiting for a second operator');

    if (d.note) await insertNote(tx, item.id, op.userId, d.note);

    const actionId = newId();
    const secondNeeded = await needsSecondSignOff(tx, action, d.amountCents);
    await tx.insert(reviewActions).values({
      id: actionId,
      itemId: item.id,
      action,
      actorOperatorId: op.userId,
      data: sql`${JSON.stringify(d)}::jsonb`,
      status: secondNeeded ? 'pending_second' : 'applied',
    });

    if (secondNeeded) {
      await record(tx, {
        actorType: 'operator',
        actorId: op.userId,
        action: 'trust.decision_pending',
        subjectType: 'review_item',
        subjectId: item.id,
        data: {
          queue: item.queue,
          decision: action,
          actionId,
          ...(d.amountCents !== undefined ? { amountCents: d.amountCents } : {}),
        },
      });
      return { status: 'pending_second' as const };
    }

    await applyDecision(tx, item, {
      actionId,
      action,
      data: d,
      handler,
      decidedBy: op.userId,
      appliedBy: op.userId,
      secondOperatorId: null,
    });
    return { status: 'applied' as const };
  });
}

/** Locks the item, then the pending action (the same order decide uses, so no deadlock). */
async function loadPendingAction(tx: Tx, actionId: string) {
  if (!isUuid(actionId)) throw notFound('Decision not found');
  const [ref] = await tx
    .select({ itemId: reviewActions.itemId })
    .from(reviewActions)
    .where(eq(reviewActions.id, actionId));
  if (!ref) throw notFound('Decision not found');
  const item = await loadItem(tx, ref.itemId, true);
  const [action] = await tx
    .select()
    .from(reviewActions)
    .where(eq(reviewActions.id, actionId))
    .for('update');
  if (!action) throw notFound('Decision not found');
  if (action.status !== 'pending_second') {
    throw conflict('This decision is not waiting for a second sign-off');
  }
  return { item, action };
}

/**
 * The operator signing off (or turning down) someone else's pending decision. Any operator
 * qualifies, whatever queues they cover: a second sign-off is required as soon as two
 * operators exist (needsSecondSignOff), so it must never depend on who covers which queue.
 * An excluded operator (see keptOff) qualifies only when nobody else does.
 */
async function signingOperator(
  tx: Tx,
  item: ItemRecord,
  authorId: string,
  operatorId: string,
): Promise<ActiveOperator> {
  const op = await findOperator(tx, operatorId);
  if (!op) throw forbidden('Only operators can do this');
  if (await keptOff(tx, item, op.userId, { signOff: true, besides: [authorId] })) {
    throw forbidden(KEPT_OFF);
  }
  return op;
}

/**
 * The second sign-off: any operator other than its author approves a pending decision, which
 * is then applied. Throws `forbidden` when `operatorId` made the decision.
 */
export async function approveSecond(
  db: DbOrTx,
  actionId: string,
  operatorId: string,
): Promise<void> {
  await transact(db, async (tx) => {
    const { item, action } = await loadPendingAction(tx, actionId);
    if (action.actorOperatorId === operatorId) {
      throw forbidden('A second, different operator must approve this decision');
    }
    assertOpen(item);
    const op = await signingOperator(tx, item, action.actorOperatorId, operatorId);
    const handler = await requireHandler(item.subjectType, action.action);

    await tx
      .update(reviewActions)
      .set({ status: 'applied', secondOperatorId: op.userId })
      .where(eq(reviewActions.id, action.id));
    await applyDecision(tx, item, {
      actionId: action.id,
      action: action.action,
      data: (action.data ?? {}) as DecisionData,
      handler,
      decidedBy: action.actorOperatorId,
      appliedBy: op.userId,
      secondOperatorId: op.userId,
    });
  });
}

/**
 * Turns down (any operator who could sign it off) or, by its author, withdraws a decision
 * waiting for a second sign-off. The item stays open for another decision.
 */
export async function rejectSecond(
  db: DbOrTx,
  actionId: string,
  operatorId: string,
): Promise<void> {
  await transact(db, async (tx) => {
    const { item, action } = await loadPendingAction(tx, actionId);
    const op =
      operatorId === action.actorOperatorId
        ? await actingOperator(tx, operatorId, item.queue)
        : await signingOperator(tx, item, action.actorOperatorId, operatorId);
    await tx
      .update(reviewActions)
      .set({
        status: 'rejected',
        secondOperatorId: op.userId === action.actorOperatorId ? null : op.userId,
      })
      .where(eq(reviewActions.id, action.id));
    await record(tx, {
      actorType: 'operator',
      actorId: op.userId,
      action: 'trust.decision_rejected',
      subjectType: 'review_item',
      subjectId: item.id,
      data: { queue: item.queue, decision: action.action, actionId: action.id },
    });
  });
}

// --- Appeals ----------------------------------------------------------------------------------

/**
 * Opens an appeal of a decided item in the `appeals` queue, about the same subject. The
 * operators who made the original decision (or signed it off) are its exclusions: routing never
 * gives it to them while anyone else is on shift, and they may not claim, decide, sign off or be
 * handed it while someone else is available (keptOff). One open appeal per decision.
 */
export async function openAppeal(
  db: DbOrTx,
  i: { originalItemId: string; reason: string },
): Promise<{ id: string }> {
  const reason = cleanText(i.reason, 'A reason', MAX_REASON_LENGTH);
  return transact(db, async (tx) => {
    const original = await loadItem(tx, i.originalItemId, true);
    if (original.status !== 'resolved') throw conflict('Only a decided item can be appealed');

    const [open] = await tx
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.originalItemId, original.id),
          eq(reviewItems.queue, 'appeals'),
          ne(reviewItems.status, 'resolved'),
        ),
      )
      .limit(1);
    if (open) throw conflict('This decision already has an open appeal');

    const signers = await tx
      .select({ id: reviewActions.secondOperatorId })
      .from(reviewActions)
      .where(
        and(
          eq(reviewActions.itemId, original.id),
          eq(reviewActions.status, 'applied'),
          isNotNull(reviewActions.secondOperatorId),
        ),
      );
    const exclude = [original.decidedBy, ...signers.map((s) => s.id)].filter(isUuid);

    return openReviewItem(tx, {
      queue: 'appeals',
      subjectType: original.subjectType,
      subjectId: original.subjectId,
      reason,
      originalItemId: original.id,
      excludeOperatorIds: [...new Set(exclude)],
      ...(original.checkId ? { checkId: original.checkId } : {}),
    });
  });
}
