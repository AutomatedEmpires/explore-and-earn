// Public API of the verification module: business verification signals and decisions (SP2 spec
// sections 3 and 8.4). Owned by W6 (Tasks 29-30). Imports billing, locations and orgs.
//
// Importing this module registers its notification types and the `organization` subject
// handlers (Global Constraints: registrations at module load).
import type { HandlerMap } from '@/modules/jobs';
import './notifications';
import { runJobHandlers } from './run';
import './subjects';

export {
  VERIFYING_COPY,
  getVerificationDetails,
  getVerificationStatus,
  openVerificationAppeal,
  submitVerificationInfo,
  verificationInfoSchema,
  type VerificationInfoInput,
  type VerificationStatus,
} from './decide';
export { RUN_TOPIC, requestReverification, runVerification, startVerification } from './run';
export {
  FREE_EMAIL_DOMAINS,
  collectSignals,
  defaultSignalDeps,
  hardFlags,
  rdapRegisteredAt,
  type HardFlag,
  type SignalDeps,
  type VerificationSignals,
} from './signals';
export {
  SafeFetchError,
  isPublicAddress,
  safeFetchText,
  type SafeFetchReason,
  type Transport,
} from './safe-fetch';
export { VERIFICATION_SETTINGS_PATH } from './notifications';
export { privacyHandlers } from './privacy';

/** Spec section 6: `verification.run`. */
export const jobHandlers: HandlerMap = { ...runJobHandlers };
