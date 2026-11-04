// Shared types of the trust module. The public ones are re-exported from ./index.

export const QUEUES = [
  'moderation',
  'fraud',
  'reports',
  'support',
  'child_safety',
  'billing',
  'appeals',
  'audit_sample',
] as const;

export type Queue = (typeof QUEUES)[number];

export const REVIEW_STATUSES = ['open', 'assigned', 'escalated', 'resolved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_ACTIONS = [
  'approve',
  'remove',
  'ask_info',
  'suspend',
  'ban',
  'refund',
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const ACTION_STATUSES = ['pending_second', 'applied', 'rejected'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const CHECK_DECISIONS = ['approved', 'rejected', 'needs_review'] as const;
export type CheckDecision = (typeof CHECK_DECISIONS)[number];

/** The check kinds trust registers itself: Foundation's two and SP2's four. */
export const CHECK_KINDS = [
  'image_safety',
  'text_safety',
  'listing_moderation',
  'listing_fraud',
  'business_verification',
  'photo_slot',
] as const;

/**
 * A check kind: one of CHECK_KINDS, or one a later sub-project registers with registerCheckKind
 * (message scam, ...).
 */
export type CheckKind = (typeof CHECK_KINDS)[number] | (string & {});

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
  kind: CheckKind;
  subjectType: string;
  subjectId: string;
  text?: string;
  image?: { mime: string; bytes: Uint8Array };
  wantAltText?: boolean;
  /** Where a needs_review decision opens its item. Default 'moderation'; null opens none. */
  reviewQueue?: Queue | null;
};

export type CheckResult = {
  checkId: string;
  decision: CheckDecision;
  score: number;
  labels: string[];
  reason: string;
  altText?: string;
};
