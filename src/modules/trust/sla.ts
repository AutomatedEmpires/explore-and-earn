// The SLA sweep (`review.sla_sweep`, every 5 minutes): moves overdue items to someone else, and
// alerts the Owners when nobody else can take one.
import { and, asc, desc, eq, lte, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { record } from '@/modules/audit';
import { raiseAlert } from './alerts';
import { touchOperator, transact } from './internal';
import { pickAssignee, slaDueAt } from './routing';
import { reviewItems } from './schema';

/** Items handled per sweep; the rest wait for the next run five minutes later. */
export const SWEEP_LIMIT = 500;

/**
 * For each unresolved item past `sla_due_at`: assigns it to another operator (never the
 * current assignee, nor an excluded one) and restarts its clock with the queue's time limit.
 * When nobody else is available it sets `sla_breached_at`, once, and raises a critical alert;
 * the item keeps its assignee and is retried on the next sweep.
 *
 * Items not yet breached come first: a breached item keeps its old due time, so a backlog of
 * them (nobody on shift for a while) would otherwise fill every batch and newly overdue items
 * would never be reassigned or alerted. Each sweep moves the unbreached ones out of that group
 * (reassigned with a new due time, or breached), so the breached ones still get their turn.
 */
export async function slaSweep(
  db: DbOrTx,
  now: Date,
): Promise<{ reassigned: number; breached: number }> {
  return transact(db, async (tx) => {
    const overdue = await tx
      .select({
        id: reviewItems.id,
        queue: reviewItems.queue,
        status: reviewItems.status,
        assignee: reviewItems.assigneeOperatorId,
        exclude: reviewItems.excludeOperatorIds,
        breachedAt: reviewItems.slaBreachedAt,
        slaDueAt: reviewItems.slaDueAt,
      })
      .from(reviewItems)
      .where(and(ne(reviewItems.status, 'resolved'), lte(reviewItems.slaDueAt, now)))
      .orderBy(
        sql`${reviewItems.slaBreachedAt} is not null`,
        desc(reviewItems.priority),
        asc(reviewItems.slaDueAt),
        asc(reviewItems.id),
      )
      .limit(SWEEP_LIMIT)
      // A concurrent sweep (or an operator's claim) skips the rows this one is handling.
      .for('update', { skipLocked: true });

    let reassigned = 0;
    let breached = 0;
    for (const item of overdue) {
      const next = await pickAssignee(tx, item.queue, [...item.exclude, item.assignee]);
      if (next) {
        await tx
          .update(reviewItems)
          .set({
            assigneeOperatorId: next,
            assignedAt: now,
            status: item.status === 'open' ? 'assigned' : item.status,
            slaDueAt: slaDueAt(item.queue, now),
          })
          .where(eq(reviewItems.id, item.id));
        await touchOperator(tx, next, now);
        await record(tx, {
          actorType: 'system',
          actorId: null,
          action: 'trust.sla_reassigned',
          subjectType: 'review_item',
          subjectId: item.id,
          data: {
            queue: item.queue,
            from: item.assignee,
            to: next,
            dueAt: item.slaDueAt.toISOString(),
          },
        });
        reassigned++;
      } else if (!item.breachedAt) {
        await tx.update(reviewItems).set({ slaBreachedAt: now }).where(eq(reviewItems.id, item.id));
        await raiseAlert(tx, {
          severity: 'critical',
          kind: 'sla_breach',
          message: `A ${item.queue} review item is past its time limit and nobody else is available to take it.`,
          data: { itemId: item.id, queue: item.queue, assignee: item.assignee },
        });
        breached++;
      }
    }
    return { reassigned, breached };
  });
}
