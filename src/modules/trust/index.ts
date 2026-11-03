// Public API of the trust module (AI checks, review queues). Owned by W5 (Tasks 14-16).
import type { HandlerMap } from '@/modules/jobs';

export { CLASSIFIER_ERROR, runCheck } from './checks';
export { SLA_HOURS, openReviewItem } from './routing';
export {
  QUEUES,
  REVIEW_ACTIONS,
  type ActionStatus,
  type CheckDecision,
  type CheckKind,
  type CheckResult,
  type OpenReviewItemInput,
  type Queue,
  type ReviewAction,
  type ReviewStatus,
  type RunCheckInput,
} from './types';

export const jobHandlers: HandlerMap = {};
