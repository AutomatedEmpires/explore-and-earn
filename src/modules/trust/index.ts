// Public API of the trust module (AI checks, review queues). Owned by W5 (Tasks 14-16).
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HandlerMap } from '@/modules/jobs';

export type Queue =
  | 'moderation'
  | 'fraud'
  | 'reports'
  | 'support'
  | 'child_safety'
  | 'billing'
  | 'appeals'
  | 'audit_sample';

export type OpenReviewItemInput = {
  queue: Queue;
  subjectType: string;
  subjectId: string;
  reason: string;
  checkId?: string;
  aiConfidence?: number;
  priority?: number;
  excludeOperatorIds?: string[];
  originalItemId?: string;
};

export type RunCheckInput = {
  kind: 'image_safety' | 'text_safety';
  subjectType: string;
  subjectId: string;
  text?: string;
  image?: { mime: string; bytes: Uint8Array };
  wantAltText?: boolean;
};

export type CheckResult = {
  checkId: string;
  decision: 'approved' | 'rejected' | 'needs_review';
  score: number;
  labels: string[];
  reason: string;
  altText?: string;
};

/** Opens a review item and routes it to an operator. Stub: Task 15 replaces it. */
export async function openReviewItem(
  _db: DbOrTx,
  _i: OpenReviewItemInput,
): Promise<{ id: string }> {
  throw new Error('not implemented');
}

/** Classifies content and applies the thresholds. Stub (always approves): Task 14 replaces it. */
export async function runCheck(_db: DbOrTx, _i: RunCheckInput): Promise<CheckResult> {
  return { checkId: newId(), decision: 'approved', score: 0, labels: [], reason: 'stub' };
}

export const jobHandlers: HandlerMap = {};
