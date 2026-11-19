// Public API of the verification module: business verification signals and decisions (SP2 spec
// sections 3 and 8.4). Owned by W6 (Tasks 29-30). Imports billing, locations and orgs.
//
// `hostApplicantGate` is the one gate SP4 apply and SP5 pool, invites and applicant reads call
// before a host sees applicant data or sends an invite; only a verified host passes.
// `canAcceptApplications` calls it too. `requireProfileView` is the new-host daily cap on
// profile views, and `alertSilentHost` the silent-host alert (legal review 7.3).
//
// Importing this module registers its notification types and the `organization` subject
// handlers (Global Constraints: registrations at module load).
import type { HandlerMap } from '@/modules/jobs';
import './notifications';
import { runJobHandlers } from './run';
import './subjects';

export {
  APPLICANT_DATA_BLOCKED,
  PROFILE_VIEW_CAP_COPY,
  SILENT_HOST_OPENED,
  SILENT_HOST_REASON,
  alertSilentHost,
  applicantDataBlock,
  hostApplicantGate,
  requireProfileView,
  silentHostAlert,
  type ApplicantDataBlock,
  type HostApplicantGate,
} from './host-gate';
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
export {
  BAN_FINGERPRINTS_TOPIC,
  RUN_TOPIC,
  requestReverification,
  runVerification,
  startVerification,
} from './run';
export {
  FREE_EMAIL_DOMAINS,
  banCardOnFile,
  banFingerprints,
  brandCareersMismatch,
  cardFitsBusiness,
  collectSignals,
  defaultSignalDeps,
  domainPredatesAccount,
  fingerprintValue,
  hardFlags,
  manualReviewReasons,
  normalizeName,
  rdapRegisteredAt,
  type CardProfile,
  type HardFlag,
  type HostFingerprints,
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
export { privacyHandler, retentionRules } from './privacy';

/** Spec section 6: `verification.run`; legal review 7 item 6: `verification.ban_fingerprints`. */
export const jobHandlers: HandlerMap = { ...runJobHandlers };
