// Review items: opening them and routing each to one operator.
//
// Routing picks the on-shift operator covering the queue (Owners cover every queue) with the
// fewest items in hand (assigned or escalated), ties to whoever was assigned longest ago, never
// first. When nobody can take it, the item still opens, unassigned (`open`): the SLA sweep
// alerts the Owner once it is overdue, so nothing is lost (Review Focus 4).
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { raiseAlert } from './alerts';
import { leastLoadedOperator, touchOperator, transact } from './internal';
import { reviewItems } from './schema';
import type { OpenReviewItemInput, Queue } from './types';

/** Hours an item may wait in each queue before the SLA sweep moves it on. */
export const SLA_HOURS: Record<Queue, number> = {
  child_safety: 1,
  fraud: 4,
  reports: 24,
  support: 24,
  moderation: 24,
  billing: 24,
  appeals: 24,
  audit_sample: 24,
};

const HOUR_MS = 60 * 60 * 1000;

export function slaDueAt(queue: Queue, from: Date): Date {
  return new Date(from.getTime() + SLA_HOURS[queue] * HOUR_MS);
}

/**
 * The operator who should take the next `queue` item, or null when nobody can: on shift,
 * covering the queue, not in `exclude`, account not deleted; fewest assigned or escalated
 * items first, then the oldest `last_assigned_at` (never assigned first).
 */
export async function pickAssignee(
  db: DbOrTx,
  queue: Queue,
  exclude: readonly (string | null | undefined)[] = [],
): Promise<string | null> {
  return leastLoadedOperator(db, { queue, onShift: true, exclude });
}

/**
 * Opens a review item due after its queue's time limit (SLA_HOURS) and assigns it through
 * pickAssignee; with nobody free it stays `open` and unassigned. A child-safety item always
 * raises a critical alert to the Owners. Records `trust.item_opened`.
 */
export async function openReviewItem(db: DbOrTx, i: OpenReviewItemInput): Promise<{ id: string }> {
  return transact(db, async (tx) => {
    const id = newId();
    const now = new Date();
    const exclude = i.excludeOperatorIds ?? [];
    const assignee = await pickAssignee(tx, i.queue, exclude);

    await tx.insert(reviewItems).values({
      id,
      queue: i.queue,
      status: assignee ? 'assigned' : 'open',
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      checkId: i.checkId ?? null,
      reason: i.reason,
      aiConfidence: i.aiConfidence ?? null,
      priority: i.priority ?? 0,
      assigneeOperatorId: assignee,
      assignedAt: assignee ? now : null,
      excludeOperatorIds: exclude,
      originalItemId: i.originalItemId ?? null,
      slaDueAt: slaDueAt(i.queue, now),
    });
    if (assignee) await touchOperator(tx, assignee, now);

    await record(tx, {
      actorType: 'system',
      actorId: null,
      action: 'trust.item_opened',
      subjectType: 'review_item',
      subjectId: id,
      data: {
        queue: i.queue,
        subjectType: i.subjectType,
        subjectId: i.subjectId,
        assignee,
        checkId: i.checkId ?? null,
        originalItemId: i.originalItemId ?? null,
      },
    });

    if (i.queue === 'child_safety') {
      await raiseAlert(tx, {
        severity: 'critical',
        kind: 'child_safety',
        message: 'A child-safety match was blocked and needs review now.',
        data: { itemId: id, queue: i.queue, subjectType: i.subjectType, subjectId: i.subjectId },
      });
    }
    return { id };
  });
}
