// Public API of the trust module (AI checks, review queues). Owned by W5 (Tasks 14-16).
import type { HandlerMap } from '@/modules/jobs';
import { auditSample } from './sampling';
import { slaSweep } from './sla';

export {
  addNote,
  approveSecond,
  claim,
  decide,
  escalate,
  handOff,
  openAppeal,
  parseMentions,
  rejectSecond,
  type DecisionData,
} from './actions';
export { raiseAlert, type Alert } from './alerts';
export { CLASSIFIER_ERROR, findLatestCheck, runCheck } from './checks';
export { SLA_HOURS, listOpenReviewItems, openReviewItem, pickAssignee } from './routing';
export { auditSample } from './sampling';
export { slaSweep } from './sla';
export {
  TEST_ITEM_SUBJECT,
  registerSubjectHandlers,
  type SubjectHandler,
  type SubjectHandlers,
} from './subjects';
export {
  CHECK_KINDS,
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

export const jobHandlers: HandlerMap = {
  'review.sla_sweep': async (_payload, { db, now }) => {
    await slaSweep(db, now);
  },
  'trust.audit_sample': async (_payload, { db, now }) => {
    await auditSample(db, now);
  },
};
