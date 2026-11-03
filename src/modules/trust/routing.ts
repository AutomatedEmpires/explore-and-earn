// Review items: opening them, with a time limit per queue.
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
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

/** Opens a review item, due after its queue's time limit. */
export async function openReviewItem(db: DbOrTx, i: OpenReviewItemInput): Promise<{ id: string }> {
  const id = newId();
  await db.insert(reviewItems).values({
    id,
    queue: i.queue,
    status: 'open',
    subjectType: i.subjectType,
    subjectId: i.subjectId,
    checkId: i.checkId ?? null,
    reason: i.reason,
    aiConfidence: i.aiConfidence ?? null,
    priority: i.priority ?? 0,
    excludeOperatorIds: i.excludeOperatorIds ?? [],
    originalItemId: i.originalItemId ?? null,
    slaDueAt: slaDueAt(i.queue, new Date()),
  });
  return { id };
}
