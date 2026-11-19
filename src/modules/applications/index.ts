// Public API of the applications module (SP4 spec 3): submitting, the status table, withdraw,
// the seeker's lists and receipts, and host reads. Complete from W0: every name used outside the
// module is here, and owners replace the stubs behind it without editing this file.
// Imports point one way: applications -> profiles -> safety.
import 'server-only';
import type { HandlerMap } from '@/modules/jobs';
import { eventHandlers } from './events';
import { silentHostHandlers } from './host-activity';
// Module-load registrations: notification types, then the SP3 overlay, SP2 stats provider and
// resume reference checker.
import './notification-types';
import './register';

export * from '@/lib/applications';
export { RATE_LIMITS } from './constants';
export { submitApplication } from './submit';
export { setAdditionalStep, setStatus, withdraw, withdrawOpenForOrg } from './status';
export { countApplicationsSince, getApplyContext, getReceipt, listMyApplications } from './reads';
export { authorizeHostApplication, getHostApplication, getHostCards, getSnapshot } from './host';
export {
  HOST_OPEN_ACTIONS,
  SILENT_HOST_TOPIC,
  checkSilentHost,
  recordHostOpen,
  type HostOpenAction,
} from './host-activity';
export { privacyHandler, retentionRules } from './privacy';

/** SP4's event handlers, and `applications.silent_host_check` (legal review 7.3). */
export const jobHandlers: HandlerMap = { ...eventHandlers, ...silentHostHandlers };
