// Public API of the profiles module (SP4 spec 3): the seeker profile and resume, availability,
// pools and staged reveal, AI import and writing help. Complete from W0: every name used outside
// the module is here, and owners replace the stubs behind it without editing this file.
// Imports point one way: applications -> profiles -> safety.
import 'server-only';
import type { HandlerMap } from '@/modules/jobs';
import { importJobHandlers } from './imports/jobs';
import { coreJobHandlers } from './jobs-core';
// Module-load registrations: notification types, then trust and report subjects.
import './notification-types';
import './moderation';

export * from '@/lib/profiles';
export { RATE_LIMITS } from './constants';
export {
  buildProfileSnapshot,
  getCommunityIdentities,
  getOwnProfile,
  getPreferenceTargets,
  needsAttention,
  updateProfile,
} from './profile';
export { addEntry, deleteEntry, reorderEntries, setSkills, updateEntry } from './entries';
export { availabilitySweep, confirmAvailability, setAvailability } from './availability-store';
export { getCandidateCards, getFitInputs, grantReveal, queryPoolCandidates } from './pools';
export { renderResumePdf } from './resume/render';
export { resumePdfResponse } from './resume/response';
export { cancelImport, createImport, getImport, revokeAiConsent } from './imports/service';
export { mergeImport } from './imports/merge';
export { expireImports } from './imports/expire';
export { writingHelp } from './writing-help';
export { privacyHandler, retentionRules } from './privacy';

export const jobHandlers: HandlerMap = { ...coreJobHandlers, ...importJobHandlers };
