// Public API of the safety module (SP4 spec 3): reports, blocks and mutes, which every later
// sub-project reuses. Complete from W0: every name used outside the module is here, and owners
// replace the stubs behind it without editing this file. Safety imports neither profiles nor
// applications.
import 'server-only';
import type { HandlerMap } from '@/modules/jobs';
// Module-load registrations: the notification type, then the listing and org report subjects.
import './notification-types';
import './register';

export * from '@/lib/safety';
export { RATE_LIMITS } from './constants';
export { listReportsAbout, registerReportSubject, report } from './reports';
export {
  block,
  blockedUserIdsForOrg,
  getBlockSet,
  getRelationships,
  isBlockedBetween,
  listBlocks,
  unblock,
  unblockById,
} from './blocks';
export { listMutes, mute, unmute } from './mutes';
export { privacyHandler, retentionRules } from './privacy';

export const jobHandlers: HandlerMap = {};
