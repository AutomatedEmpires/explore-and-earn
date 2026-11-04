// An in-memory listings module for B1 tests that mock '@/modules/listings'. setListing adds a
// listing (with its state); the read functions derive from what was added.
import type { Category } from '@/lib/taxonomy';
import type {
  HomeSummary,
  ListingRowBadgeProvider,
  ListingState,
  ListingStatsProvider,
  ListingSummary,
  PublishedListing,
} from '@/modules/listings';

type Stored = PublishedListing & { state: ListingState };

const EMPTY_HOME: HomeSummary = {
  reminders: [],
  quota: {
    listingSlots: { used: 0, limit: 0 },
    seats: { used: 1, limit: 1 },
    inviteCredits: { balance: 0, resetsAt: null },
  },
  setup: { location: false, plan: false, firstListing: false },
};

const state = {
  listings: new Map<string, Stored>(),
  history: new Map<string, { firstPublishedAt: Date; primaryCategory: Category }[]>(),
  home: new Map<string, HomeSummary>(),
  occupations: [] as { code: string; label: string; socCode: string; categories: Category[] }[],
  statsProviders: new Map<string, ListingStatsProvider>(),
  rowBadgeProviders: [] as ListingRowBadgeProvider[],
  calls: [] as { name: string; args: unknown[] }[],
};

const log = (name: string, args: unknown[]) => state.calls.push({ name, args });

const active = () => [...state.listings.values()].filter((l) => l.state === 'active');

function locationOf(l: Stored): string | null {
  const where = (
    l.content as { where?: { mode?: string; locationId?: string; hostLocationId?: string } }
  ).where;
  if (!where) return null;
  return where.mode === 'remote' ? (where.hostLocationId ?? null) : (where.locationId ?? null);
}

function summaryOf(l: Stored): ListingSummary {
  const basics = (l.content as { basics?: { title?: string; primaryCategory?: Category } }).basics;
  return {
    orgId: l.orgId,
    title: basics?.title ?? '',
    state: l.state,
    locationId: locationOf(l),
    primaryCategory: basics?.primaryCategory ?? 'seasonal',
    publishedRevisionId: l.revisionId,
  };
}

const fns = {
  async getPublishedListing(_db: unknown, listingId: string) {
    log('getPublishedListing', [listingId]);
    const l = state.listings.get(listingId);
    if (!l || l.state !== 'active') return null;
    const { state: _state, ...published } = l;
    return published;
  },

  async getRevision(_db: unknown, revisionId: string) {
    log('getRevision', [revisionId]);
    const l = [...state.listings.values()].find((r) => r.revisionId === revisionId);
    if (!l) throw new Error(`listingsFake: no revision ${revisionId}`);
    return { ...l };
  },

  async listActiveListings(_db: unknown, i: { after?: string; limit: number }) {
    log('listActiveListings', [i]);
    const sorted = active().sort((a, b) => a.listingId.localeCompare(b.listingId));
    const from = i.after ? sorted.filter((l) => l.listingId > (i.after as string)) : sorted;
    const page = from.slice(0, i.limit).map(({ state: _state, ...l }) => l);
    const last = page[page.length - 1];
    return { items: page, next: from.length > i.limit && last ? last.listingId : null };
  },

  async getListingSummaries(_db: unknown, ids: string[]) {
    log('getListingSummaries', [ids]);
    const out = new Map<string, ListingSummary>();
    for (const id of ids) {
      const l = state.listings.get(id);
      if (l) out.set(id, summaryOf(l));
    }
    return out;
  },

  async canAcceptApplications(_db: unknown, listingId: string, now: Date = new Date()) {
    log('canAcceptApplications', [listingId, now]);
    const l = state.listings.get(listingId);
    if (!l || l.state !== 'active') return { ok: false as const, reason: 'not_active' as const };
    if (l.applicationsCloseAt && now >= l.applicationsCloseAt) {
      return { ok: false as const, reason: 'deadline_passed' as const };
    }
    return { ok: true as const, revisionId: l.revisionId };
  },

  registerListingStatsProvider(name: string, fn: ListingStatsProvider) {
    log('registerListingStatsProvider', [name]);
    state.statsProviders.set(name, fn);
  },

  registerListingRowBadgeProvider(fn: ListingRowBadgeProvider) {
    log('registerListingRowBadgeProvider', []);
    state.rowBadgeProviders.push(fn);
  },

  async getHomeSummary(_db: unknown, ctx: { orgId: string }) {
    log('getHomeSummary', [ctx.orgId]);
    return structuredClone(state.home.get(ctx.orgId) ?? EMPTY_HOME);
  },

  async listOccupations() {
    log('listOccupations', []);
    return state.occupations.map((o) => ({ ...o, categories: [...o.categories] }));
  },

  async countActiveByLocation(_db: unknown, locationIds: string[]) {
    log('countActiveByLocation', [locationIds]);
    const out = new Map<string, number>();
    for (const l of active()) {
      const loc = locationOf(l);
      if (loc && locationIds.includes(loc)) out.set(loc, (out.get(loc) ?? 0) + 1);
    }
    return out;
  },

  async getOrgListingStats(_db: unknown, orgIds: string[]) {
    log('getOrgListingStats', [orgIds]);
    const out = new Map<string, { active: number }>();
    for (const orgId of orgIds) {
      out.set(orgId, { active: active().filter((l) => l.orgId === orgId).length });
    }
    return out;
  },

  async getOrgListingFacts(_db: unknown, orgId: string) {
    log('getOrgListingFacts', [orgId]);
    const live = active()
      .filter((l) => l.orgId === orgId)
      .map(({ state: _state, ...l }) => l);
    return { active: live, history: [...(state.history.get(orgId) ?? [])] };
  },

  async closeAllForOrg(_db: unknown, orgId: string, reason: 'org_suspended' | 'host') {
    log('closeAllForOrg', [orgId, reason]);
    for (const l of state.listings.values()) {
      if (l.orgId === orgId && (l.state === 'active' || l.state === 'in_review'))
        l.state = 'closed';
    }
  },

  async enforceSlotLimit(_db: unknown, orgId: string) {
    log('enforceSlotLimit', [orgId]);
  },
} satisfies Partial<typeof import('@/modules/listings')>;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/listings'), keyof typeof fns>;

export const listingsFake = Object.assign(fns as Fns, {
  calls: state.calls,
  statsProviders: state.statsProviders,
  rowBadgeProviders: state.rowBadgeProviders,
  /** Adds or replaces a listing; `state` defaults to `active`. */
  setListing(l: PublishedListing, listingState: ListingState = 'active') {
    state.listings.set(l.listingId, { ...l, state: listingState });
  },
  /** Past listings for the host page's "Usually hires". */
  setHistory(orgId: string, history: { firstPublishedAt: Date; primaryCategory: Category }[]) {
    state.history.set(orgId, history);
  },
  setHomeSummary(orgId: string, summary: HomeSummary) {
    state.home.set(orgId, summary);
  },
  setOccupations(list: { code: string; label: string; socCode: string; categories: Category[] }[]) {
    state.occupations = list;
  },
  stateOf(listingId: string): ListingState | null {
    return state.listings.get(listingId)?.state ?? null;
  },
  reset() {
    state.listings.clear();
    state.history.clear();
    state.home.clear();
    state.occupations = [];
    state.calls.length = 0;
  },
});
