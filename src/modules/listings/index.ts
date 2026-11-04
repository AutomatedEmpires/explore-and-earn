// Public API of the listings module: taxonomy, listings, revisions, checks, lifecycle,
// screening, library, repost, AI import and description, the host Home summary and listing row
// hooks (SP2 spec sections 3 and 8.2-8.3). W0 contract: typed stubs that W5 (Tasks 22-28)
// replaces. Imports orgs, locations, billing, entitlements and verification.
import type { DbOrTx } from '@/lib/db';
import type { Category } from '@/lib/taxonomy';
import type { HandlerMap } from '@/modules/jobs';
import type { HostContext } from '@/server/guards';

/** Placeholder until Task 8 adds ListingContentSchema (src/modules/listings/content.ts). */
export type ListingContent = Record<string, unknown>;

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

/** SP4 apply. */
export async function canAcceptApplications(
  _db: DbOrTx,
  _listingId: string,
  _now?: Date,
): Promise<
  | { ok: true; revisionId: string }
  | { ok: false; reason: 'not_active' | 'org_inactive' | 'deadline_passed' }
> {
  return notImplemented('canAcceptApplications');
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

/** SP4 and SP5 compare skills by key. Task 8 replaces this stub. */
export function normalizeSkill(_label: string): { key: string; label: string } {
  return notImplemented('normalizeSkill');
}

export async function listOccupations(
  _db: DbOrTx,
): Promise<{ code: string; label: string; socCode: string; categories: Category[] }[]> {
  return notImplemented('listOccupations');
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
  'listings.screen': noop,
  'listings.photo_slot_check': noop,
  'listings.resume_screening': noop,
  'listings.enforce_slot_limit': noop,
  'listings.close_for_org': noop,
  'listings.still_hiring_sweep': noop,
  'listings.auto_close': noop,
  'listings.repost_reminders': noop,
};
