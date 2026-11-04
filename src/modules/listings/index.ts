// Public API of the listings module: taxonomy, listings, revisions, checks, lifecycle,
// screening, library, repost, AI import and description, the host Home summary and listing row
// hooks (SP2 spec sections 3 and 8.2-8.3). Imports orgs, locations, billing, entitlements and
// verification. Importing it registers the listing_slot usage counter, the trust subject
// handlers (`listing_revision`, `listing`) and the `listings.*` notification types.
import type { HandlerMap } from '@/modules/jobs';

export {
  HOUSING_SLOTS,
  LISTING_SCHEMA_VERSION,
  ListingContentSchema,
  ListingDraftSchema,
  MEAL_SLOTS,
  SECTION_CONTENT_KEYS,
  type BuilderSection,
  type Cost,
  type DeepPartial,
  type HousingSlot,
  type ListingContent,
  type ListingContentInput,
  type ListingDraft,
  type MealSlot,
  type ScreeningQuestion,
} from './content';
export { normalizeSkill } from './skills';
export { listOccupations, type Occupation } from './occupations';
export { toRevisionColumns, type RevisionColumns, type RevisionContext } from './revision-columns';
export { BUILDER_SECTIONS, checklist, type ChecklistEntry } from './checklist';
export {
  createListing,
  createListingSchema,
  deleteListing,
  getListingForEditor,
  patchDraft,
  type CreateListingInput,
  type EditorListing,
  type EditorRevision,
  type ListingEditor,
  type PatchDraftInput,
} from './drafts';
export { DESCRIPTION_MAX_CHARS, MAX_BULLETS, generateDescription } from './describe';
export { AI_UNAVAILABLE_MESSAGE, PASTE_MAX_CHARS, PASTE_MIN_CHARS } from './import';
export {
  BLOCKING_CODES,
  WARNING_CODES,
  ackKey,
  checkListing,
  normalizeForPhraseMatch,
  runListingChecks,
  type Issue,
  type IssueCode,
  type ListingChecksResult,
} from './checks';
export { checkLinkSyntax, type LinkLists } from './links';
export { hourlyPayCents } from './min-wage';
export {
  decideApproval,
  publishRevision,
  rejectRevision,
  requestPublish,
  type PublishState,
} from './publish';
export { listingTeamUserIds } from './team';
export { LISTING_NOTIFICATION_TYPES } from './notifications';
export {
  domainStatus,
  getLinkSafety,
  stubLinkSafety,
  webRisk,
  type DomainStatus,
  type LinkSafety,
  type LinkVerdict,
} from './link-safety';
export {
  MEDIA_MAX_ATTEMPTS,
  listingCheckText,
  photoSlotCheck,
  resumeScreening,
  screenRevision,
} from './screening';
export { REVIEW_NOTE_MAX, requestReview } from './review-request';
export {
  autoClose,
  canAcceptApplications,
  closeListing,
  confirmActive,
  repostReminders,
  stillHiringSweep,
  type CloseReason,
} from './lifecycle';
export { repostListing } from './repost';
export {
  computeApplicationsCloseAt,
  computeAutoCloseAt,
  nextReminderAt,
  shiftListingDates,
  zonedMidnightAfter,
} from './time';
// Module-load registrations: the listing_slot usage counter and the trust subject handlers.
import './slots';
import './subjects';
import { closeForOrgJob, enforceSlotLimitJob } from './enforce';
import { autoClose, repostReminders, stillHiringSweep } from './lifecycle';
import { photoSlotCheck, resumeScreening, screenRevision } from './screening';
export { CATEGORIES, GENRES, PERKS, type Category } from '@/lib/taxonomy';

export type {
  HomeReminder,
  HomeSummary,
  ListingRowBadgeProvider,
  ListingState,
  ListingStats,
  ListingStatsProvider,
  ListingSummary,
  PublishedListing,
} from './types';
export {
  countActiveByLocation,
  getListingSummaries,
  getOrgListingFacts,
  getOrgListingStats,
  getPublishedListing,
  getRevision,
  listActiveListings,
} from './read';
export { closeAllForOrg, enforceSlotLimit } from './enforce';
export { registerListingRowBadgeProvider, registerListingStatsProvider } from './providers';
export { listOrgListings, LISTINGS_PAGE_SIZE, type ListingRow, type ListingTab } from './list';
export { getHomeSummary } from './home';
export { privacyHandlers } from './privacy';

/** The listings outbox topics (spec section 6). */
export const jobHandlers: HandlerMap = {
  'listings.screen': async (payload, { db, now }) => {
    await screenRevision(db, payload, now);
  },
  'listings.photo_slot_check': async (payload, { db, now }) => {
    await photoSlotCheck(db, payload, now);
  },
  'listings.resume_screening': async (payload, { db, now }) => {
    await resumeScreening(db, payload, now);
  },
  'listings.enforce_slot_limit': async (payload, { db, now }) => {
    await enforceSlotLimitJob(db, payload, now);
  },
  'listings.close_for_org': async (payload, { db, now }) => {
    await closeForOrgJob(db, payload, now);
  },
  'listings.still_hiring_sweep': async (_payload, { db, now }) => {
    await stillHiringSweep(db, now);
  },
  'listings.auto_close': async (_payload, { db, now }) => {
    await autoClose(db, now);
  },
  'listings.repost_reminders': async (_payload, { db, now }) => {
    await repostReminders(db, now);
  },
};
