// Public API of the operator module: operator console data and stats. Owned by W8 (Task 24).
import type { HandlerMap } from '@/modules/jobs';

export {
  coversQueue,
  getReviewItem,
  isQueue,
  isStatusFilter,
  listReviewItems,
  mayOpenItem,
  mediaSubject,
  queueCounts,
  REVIEW_STATUSES,
  reviewActionInfo,
  reviewItemQueue,
  type ItemAction,
  type ItemCheck,
  type ItemDetail,
  type ItemFilter,
  type ItemNote,
  type ItemSummary,
  type ItemViewer,
  type MediaSubject,
  type QueueCount,
  type StatusFilter,
} from './items';
export {
  inviteOperator,
  listOperators,
  setOperatorQueues,
  setShiftStatus,
  type OperatorSummary,
  type ShiftStatus,
} from './operators';
export { operatorStats, type OperatorStats } from './stats';
export { createTestItem, DEFAULT_TEST_ITEM_TEXT, testItemText, type TestItem } from './test-items';

export const jobHandlers: HandlerMap = {};
