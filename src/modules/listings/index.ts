// Public API of the listings module: taxonomy, listings, revisions, checks, lifecycle,
// screening, library, repost, AI import and description, the host Home summary and listing row
// hooks (SP2 spec sections 3 and 8.2-8.3). W0 contract: typed stubs that W5 (Tasks 22-28)
// replaces. Imports orgs, locations, billing, entitlements and verification.
import type { DbOrTx } from '@/lib/db';
import type { Category } from '@/lib/taxonomy';
import type { HandlerMap } from '@/modules/jobs';
import type { HostContext } from '@/server/guards';
import type { ListingContent } from './content';

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
import { autoClose, repostReminders, stillHiringSweep } from './lifecycle';
import { photoSlotCheck, resumeScreening, screenRevision } from './screening';
export { CATEGORIES, GENRES, PERKS, type Category } from '@/lib/taxonomy';

export type ListingState = 'draft' | 'in_review' | 'active' | 'closed' | 'removed';

export type PublishedListing = {
  listingId: string;
  revisionId: string;
  orgId: string;
  content: ListingContent;
  firstPublishedAt: Date;
  publishedAt: Date;
  confirmedActiveAt: Date | null;
  autoCloseAt: Date | null;
  /** From applying.deadline (section 8.2); the listing stays active after it. */
  applicationsCloseAt: Date | null;
  provenance: 'host_created' | 'imported' | 'sourced';
};

export type ListingSummary = {
  orgId: string;
  title: string;
  state: ListingState;
  locationId: string | null;
  primaryCategory: Category;
  publishedRevisionId: string | null;
};

export type ListingStats = { views: number; saves: number; applications: number; hires: number };

export type ListingStatsProvider = (
  db: DbOrTx,
  ids: string[],
) => Promise<Map<string, Partial<ListingStats>>>;

export type ListingRowBadgeProvider = (
  db: DbOrTx,
  orgId: string,
  ids: string[],
) => Promise<Map<string, { label: string; href: string }>>;

export type HomeReminder = {
  kind: 'still_hiring' | 'approval' | 'verification' | 'payment' | 'repost';
  listingId: string | null;
  title: string;
  href: string;
  at: Date;
};

export type HomeSummary = {
  reminders: HomeReminder[];
  quota: {
    listingSlots: { used: number; limit: number };
    seats: { used: number; limit: number };
    inviteCredits: { balance: number; resetsAt: Date | null };
  };
  setup: { location: boolean; plan: boolean; firstListing: boolean };
};

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W5)`);
}

/** The live revision of an `active` listing, else null. */
export async function getPublishedListing(
  _db: DbOrTx,
  _listingId: string,
): Promise<PublishedListing | null> {
  return notImplemented('getPublishedListing');
}

/** Any revision, with its listing's state (SP4 snapshots). */
export async function getRevision(
  _db: DbOrTx,
  _revisionId: string,
): Promise<PublishedListing & { state: ListingState }> {
  return notImplemented('getRevision');
}

/** SP3 backfill. */
export async function listActiveListings(
  _db: DbOrTx,
  _i: { after?: string; limit: number },
): Promise<{ items: PublishedListing[]; next: string | null }> {
  return notImplemented('listActiveListings');
}

export async function getListingSummaries(
  _db: DbOrTx,
  _ids: string[],
): Promise<Map<string, ListingSummary>> {
  return notImplemented('getListingSummaries');
}

const statsProviders = new Map<string, ListingStatsProvider>();

/** SP3, SP4 and SP5 fill the Library stats. */
export function registerListingStatsProvider(name: string, fn: ListingStatsProvider): void {
  statsProviders.set(name, fn);
}

const rowBadgeProviders: ListingRowBadgeProvider[] = [];

/** SP6 "Boosted until [date]". */
export function registerListingRowBadgeProvider(fn: ListingRowBadgeProvider): void {
  rowBadgeProviders.push(fn);
}

/** SP5 Home (section 7). */
export async function getHomeSummary(_db: DbOrTx, _ctx: HostContext): Promise<HomeSummary> {
  return notImplemented('getHomeSummary');
}

/** Active listings per location (location archiving, host page groups). */
export async function countActiveByLocation(
  _db: DbOrTx,
  _locationIds: string[],
): Promise<Map<string, number>> {
  return notImplemented('countActiveByLocation');
}

export async function getOrgListingStats(
  _db: DbOrTx,
  _orgIds: string[],
): Promise<Map<string, { active: number }>> {
  return notImplemented('getOrgListingStats');
}

/** The host page's jobs and its "Usually hires" history. */
export async function getOrgListingFacts(
  _db: DbOrTx,
  _orgId: string,
): Promise<{
  active: PublishedListing[];
  history: { firstPublishedAt: Date; primaryCategory: Category }[];
}> {
  return notImplemented('getOrgListingFacts');
}

export async function closeAllForOrg(
  _db: DbOrTx,
  _orgId: string,
  _reason: 'org_suspended' | 'host',
): Promise<void> {
  return notImplemented('closeAllForOrg');
}

/** Closes listings over the org's slot limit (section 8.6), honoring a pending keep list. */
export async function enforceSlotLimit(_db: DbOrTx, _orgId: string): Promise<void> {
  return notImplemented('enforceSlotLimit');
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

const noop = async () => {};

/** W5 replaces each no-op (spec section 6). */
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
  'listings.enforce_slot_limit': noop,
  'listings.close_for_org': noop,
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
