// W5's part of the content module: legal documents, their versions and acceptances, the drafts
// for counsel and the cookie-consent epoch. content/index.ts re-exports this file.
import type { RetentionRule } from '@/modules/privacy';

export {
  getLegalVersion,
  getPublishedLegal,
  isLegalSlug,
  LEGAL_EFFECTIVE_TOPIC,
  LEGAL_NOTIFY_TOPIC,
  LEGAL_SLUGS,
  LEGAL_TITLES,
  listLegalDocumentsForConsole,
  listLegalVersions,
  NOTICE_PERIOD_DAYS,
  ONBOARDING_LEGAL,
  publishDueLegal,
  recordCounselApproval,
  RETENTION_TABLE_TOKEN,
  saveLegalDraft,
  scheduleLegal,
  type LegalDocumentRow,
  type LegalSlug,
  type LegalVersion,
  type PublishedLegal,
  type SaveLegalDraftInput,
} from './legal';
export {
  pendingAcceptances,
  publishedOnboardingLegal,
  recordAcceptance,
  type LegalItem,
} from './acceptance';
export { getConsentNotBefore, resetConsentEpochCache } from './consent-epoch';
export { ensureLegalDrafts, parseDraft, readLegalDraft, type ParsedDraft } from './drafts';
export { renderRetentionTable } from './retention-table';
export { LEGAL_NOTIFY_CHUNK, legalJobHandlers } from './legal-jobs';
export { privacyHandler } from './privacy';
export { LEGAL_STATUSES, type LegalStatus } from './schema-legal';

/** Acceptances are kept 7 years by the eraser; content owns no sweep rule. */
export const retentionRules: RetentionRule[] = [];
