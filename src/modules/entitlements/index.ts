// Public API of the entitlements module: the grants and consumptions ledger and capacity checks
// (SP2 spec sections 3 and 8.1). Owned by W1 (Tasks 9-10). Imports no SP2 module.
import type { HandlerMap } from '@/modules/jobs';

export {
  consume,
  endGrant,
  getBalance,
  grant,
  listOpenGrants,
  lockOrg,
  reverse,
  type Actor,
  type CapacityKind,
  type CreditKind,
  type EntitlementKind,
  type GrantSource,
} from './ledger';

export { getCapacity, registerUsageCounter, withCapacity, type UsageCounter } from './capacity';

export { privacyHandlers } from './privacy';

/** Entitlements owns no outbox topics. */
export const jobHandlers: HandlerMap = {};
