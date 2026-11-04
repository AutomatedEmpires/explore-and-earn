// What a decision does to its subject. Each module registers handlers for the subject types it
// owns (media registers 'media' in Task 21); trust.decide calls the one for the action, inside
// the decision's transaction, so the subject change and the resolved item commit together.
import type { DbOrTx } from '@/lib/db';
import { REVIEW_ACTIONS, type ReviewAction } from './types';

export type SubjectHandler = (db: DbOrTx, subjectId: string, data?: unknown) => Promise<void>;
export type SubjectHandlers = Partial<Record<ReviewAction, SubjectHandler>>;

const registry = new Map<string, SubjectHandlers>();

/**
 * Registers (or extends) the handlers for `subjectType`. A decision whose action has no handler
 * for its subject type is refused with `bad_request`.
 */
export function registerSubjectHandlers(subjectType: string, h: SubjectHandlers): void {
  if (!subjectType) throw new Error('registerSubjectHandlers: subjectType is required');
  registry.set(subjectType, { ...registry.get(subjectType), ...h });
}

let loadedAllModules: Promise<unknown> | undefined;

/**
 * The handler for `action` on `subjectType`, or undefined. Modules register their handlers when
 * their index is imported; the first lookup of an unknown type imports every module (through
 * the job-handler registry), so a decision works in any process, not only where the owning
 * module happens to be loaded already.
 */
export async function findSubjectHandler(
  subjectType: string,
  action: ReviewAction,
): Promise<SubjectHandler | undefined> {
  if (!registry.has(subjectType)) {
    loadedAllModules ??= import('@/server/job-handlers');
    await loadedAllModules;
  }
  return registry.get(subjectType)?.[action];
}

/** Foundation's test subject: every action is accepted and only recorded here. */
export const TEST_ITEM_SUBJECT = 'test_item';

/** The actions applied to test items in this process (newest last, at most 100). */
export const testItemLog: { action: ReviewAction; subjectId: string; data: unknown }[] = [];

const TEST_ITEM_LOG_LIMIT = 100;

registerSubjectHandlers(
  TEST_ITEM_SUBJECT,
  Object.fromEntries(
    REVIEW_ACTIONS.map((action): [ReviewAction, SubjectHandler] => [
      action,
      async (_db, subjectId, data) => {
        testItemLog.push({ action, subjectId, data });
        if (testItemLog.length > TEST_ITEM_LOG_LIMIT) testItemLog.shift();
      },
    ]),
  ),
);
