// In-memory SP2 for SP4 unit tests (SP4 plan Task 6): the listings, orgs, hostpages and
// locations functions SP4 calls, behind one set of setup functions. (SP3's fake of the same
// modules is tests/fakes/sp2.ts; SP2's own fakes are tests/fakes/sp2/.)
//
// Usage, from any test file:
//
//   vi.mock('@/modules/listings', async (orig) => ({
//     ...(await orig<typeof import('@/modules/listings')>()),
//     ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
//   }));
//   vi.mock('@/modules/orgs', async (orig) => ({
//     ...(await orig<typeof import('@/modules/orgs')>()),
//     ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
//   }));
//   vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
//   vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
//   beforeEach(() => resetSp2());
//
// This file imports no module at runtime, so it can stand in for one.
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { Category } from '@/lib/taxonomy';
import type { HostIdentity } from '@/modules/hostpages';
import type {
  ListingContent,
  ListingState,
  ListingStatsProvider,
  ListingSummary,
  PublishedListing,
  ScreeningQuestion,
} from '@/modules/listings';
import type { Location } from '@/modules/locations';
import type { Member, OrgStatus } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { makePublishedListing } from '../listing-content';

type Listings = typeof import('@/modules/listings');
type Orgs = typeof import('@/modules/orgs');
type Hostpages = typeof import('@/modules/hostpages');
type Locations = typeof import('@/modules/locations');

/** What `setListingState` can put a listing in, as SP4 sees it through SP2. */
export type FakeListingState = 'active' | 'closed' | 'removed' | 'deadline_passed' | 'org_inactive';

type FakeListing = {
  listingId: string;
  orgId: string;
  locationId: string | null;
  state: FakeListingState;
  /** The current published revision. */
  revisionId: string;
  /** Every revision ever published, newest last; closed ones stay readable. */
  revisions: Map<string, PublishedListing>;
};

type ListingAccessFn = (ctx: HostContext, l: { id: string; locationId: string | null }) => boolean;

const state = {
  listings: new Map<string, FakeListing>(),
  hosts: new Map<string, HostIdentity>(),
  locations: new Map<string, Location>(),
  members: new Map<string, Member[]>(),
  orgStatus: new Map<string, OrgStatus>(),
  statsProviders: new Map<string, ListingStatsProvider>(),
  listingAccess: (() => true) as ListingAccessFn,
};

/** What the fake was asked to do, for assertions. */
export const calls: { unfollow: { userId: string; orgId: string }[] } = { unfollow: [] };

/** The stats providers registered through `registerListingStatsProvider`, by name. */
export const statsProviders: ReadonlyMap<string, ListingStatsProvider> = state.statsProviders;

/** Forgets every listing, host, location, member, provider and recorded call. */
export function resetSp2(): void {
  state.listings.clear();
  state.hosts.clear();
  state.locations.clear();
  state.members.clear();
  state.orgStatus.clear();
  state.statsProviders.clear();
  state.listingAccess = () => true;
  calls.unfollow.length = 0;
}

/**
 * An active listing of `orgId`: the default fake content (tests/fakes/listing-content.ts) with
 * the given title, questions, sponsorship, Additional step, notify members and taxonomy.
 */
export function fakeListing(i: {
  orgId: string;
  title?: string;
  questions?: ScreeningQuestion[];
  visaSponsorship?: ListingContent['job']['visaSponsorship'];
  additionalStep?: ListingContent['applying']['additionalStep'];
  notifyMemberIds?: string[];
  primaryCategory?: Category;
  secondaryCategory?: Category | null;
  occupationCode?: string;
  locationId?: string;
}): { listingId: string; revisionId: string } {
  const listingId = newId();
  const revisionId = newId();
  const published = makePublishedListing({
    listingId,
    revisionId,
    orgId: i.orgId,
    content: {
      basics: {
        ...(i.title !== undefined ? { title: i.title } : {}),
        ...(i.primaryCategory !== undefined ? { primaryCategory: i.primaryCategory } : {}),
        ...(i.secondaryCategory !== undefined ? { secondaryCategory: i.secondaryCategory } : {}),
        ...(i.occupationCode !== undefined ? { occupationCode: i.occupationCode } : {}),
      },
      ...(i.locationId !== undefined
        ? { where: { mode: 'onsite', locationId: i.locationId } }
        : {}),
      job: i.visaSponsorship !== undefined ? { visaSponsorship: i.visaSponsorship } : {},
      applying: {
        questions: i.questions ?? [],
        additionalStep: i.additionalStep ?? null,
        notifyMemberIds: i.notifyMemberIds ?? [],
      },
    },
  });
  const where = published.content.where;
  state.listings.set(listingId, {
    listingId,
    orgId: i.orgId,
    locationId: where.mode === 'onsite' ? where.locationId : null,
    state: 'active',
    revisionId,
    revisions: new Map([[revisionId, published]]),
  });
  return { listingId, revisionId };
}

function listing(listingId: string): FakeListing {
  const l = state.listings.get(listingId);
  if (!l) throw new Error(`fake SP2: no listing ${listingId}`);
  return l;
}

/** Publishes a new revision of the listing (same content, new id) and returns its id. */
export function bumpRevision(listingId: string): string {
  const l = listing(listingId);
  const current = l.revisions.get(l.revisionId);
  if (!current) throw new Error(`fake SP2: listing ${listingId} has no current revision`);
  const revisionId = newId();
  l.revisions.set(revisionId, { ...current, revisionId, publishedAt: new Date() });
  l.revisionId = revisionId;
  return revisionId;
}

/** Edits the current revision's content in place (a test-only shortcut). */
export function editRevision(listingId: string, edit: (c: ListingContent) => void): void {
  const l = listing(listingId);
  const current = l.revisions.get(l.revisionId);
  if (current) edit(current.content);
}

export function setListingState(listingId: string, s: FakeListingState): void {
  listing(listingId).state = s;
}

/** Sets the org's public identity (name, slug, logo) as getHostIdentities returns it. */
export function fakeHost(
  orgId: string,
  i: Partial<Omit<HostIdentity, 'orgId'>> = {},
): HostIdentity {
  const host: HostIdentity = {
    orgId,
    name: 'Kettle Ridge Lodge',
    slug: `kettle-ridge-lodge-${orgId.slice(-4)}`,
    logoMediaId: null,
    coverMediaId: null,
    subscriber: { hostSince: new Date('2026-11-03T00:00:00Z') },
    hiringNow: true,
    homeLocation: { city: 'Juneau', state: 'AK' },
    ...i,
  };
  state.hosts.set(orgId, host);
  return host;
}

/** A location of the org; returns its id. */
export function fakeLocation(i: { orgId: string; city: string; state: string }): string {
  const id = newId();
  state.locations.set(id, {
    id,
    orgId: i.orgId,
    name: `${i.city} site`,
    kind: 'business_site',
    city: i.city,
    state: i.state,
    publicPoint: { lat: 58.3, lng: -134.4 },
    publicPrecision: 'city',
    publicAddressLine1: null,
    timezone: 'America/Anchorage',
    archived: false,
  });
  return id;
}

/** The org's live members, as listMembers returns them. */
export function fakeMembers(orgId: string, members: Member[]): void {
  state.members.set(orgId, members);
}

/** The org's status for getOrgStatus (default `active`). */
export function setOrgStatus(orgId: string, s: OrgStatus): void {
  state.orgStatus.set(orgId, s);
}

/** Decides canAccessListing for every host context (default: every listing). */
export function setListingAccess(fn: ListingAccessFn): void {
  state.listingAccess = fn;
}

// --- Module objects for vi.mock --------------------------------------------------------------

function summary(l: FakeListing): ListingSummary {
  const current = l.revisions.get(l.revisionId);
  const listingState: ListingState =
    l.state === 'closed' ? 'closed' : l.state === 'removed' ? 'removed' : 'active';
  return {
    orgId: l.orgId,
    title: current?.content.basics.title ?? '',
    state: listingState,
    locationId: l.locationId,
    primaryCategory: current?.content.basics.primaryCategory ?? 'seasonal',
    publishedRevisionId: listingState === 'removed' ? null : l.revisionId,
  };
}

const canAcceptApplications: Listings['canAcceptApplications'] = async (_db, listingId) => {
  const l = state.listings.get(listingId);
  if (!l) return { ok: false, reason: 'not_active' };
  switch (l.state) {
    case 'active':
      return { ok: true, revisionId: l.revisionId };
    case 'deadline_passed':
      return { ok: false, reason: 'deadline_passed' };
    case 'org_inactive':
      return { ok: false, reason: 'org_inactive' };
    default:
      return { ok: false, reason: 'not_active' };
  }
};

const getRevision: Listings['getRevision'] = async (_db, revisionId) => {
  for (const l of state.listings.values()) {
    const rev = l.revisions.get(revisionId);
    if (rev) return { ...rev, state: summary(l).state };
  }
  throw notFound('Revision not found');
};

const getListingSummaries: Listings['getListingSummaries'] = async (_db, ids) => {
  const out = new Map<string, ListingSummary>();
  for (const id of ids) {
    const l = state.listings.get(id);
    if (l) out.set(id, summary(l));
  }
  return out;
};

const getPublishedListing: Listings['getPublishedListing'] = async (_db, listingId) => {
  const l = state.listings.get(listingId);
  if (!l || l.state === 'closed' || l.state === 'removed') return null;
  return l.revisions.get(l.revisionId) ?? null;
};

const registerListingStatsProvider: Listings['registerListingStatsProvider'] = (name, fn) => {
  state.statsProviders.set(name, fn);
};

/** SP2's rule: NFKC, trimmed, spaces collapsed; the key lowercased with `&` as "and". */
const normalizeSkill: Listings['normalizeSkill'] = (label) => {
  const clean = label.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const key = clean
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9+#]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return { key, label: clean };
};

const OCCUPATIONS = [
  { code: 'deckhand', label: 'Deckhand', socCode: '53-5011', categories: ['maritime'] },
  { code: 'line_cook', label: 'Line cook', socCode: '35-2014', categories: ['seasonal'] },
  { code: 'farmhand', label: 'Farmhand', socCode: '45-2092', categories: ['farm'] },
  { code: 'support_agent', label: 'Support agent', socCode: '43-4051', categories: ['remote'] },
] satisfies Awaited<ReturnType<Listings['listOccupations']>>;

const listOccupations: Listings['listOccupations'] = async () => OCCUPATIONS.map((o) => ({ ...o }));

/** Replaces these listings functions; spread over the real module. */
export const listingsModule = {
  canAcceptApplications,
  getRevision,
  getListingSummaries,
  getPublishedListing,
  registerListingStatsProvider,
  normalizeSkill,
  listOccupations,
};

const listMembers: Orgs['listMembers'] = async (_db, orgId) => state.members.get(orgId) ?? [];

const canAccessListing: Orgs['canAccessListing'] = async (_db, ctx, l) =>
  state.listingAccess(ctx, l);

const getOrgStatus: Orgs['getOrgStatus'] = async (_db, orgId) =>
  state.orgStatus.get(orgId) ?? 'active';

/** Replaces these orgs functions; spread over the real module. */
export const orgsAdditions = { listMembers, canAccessListing, getOrgStatus };

const getHostIdentities: Hostpages['getHostIdentities'] = async (_db, orgIds) => {
  const out = new Map<string, HostIdentity>();
  for (const id of orgIds) {
    const host = state.hosts.get(id);
    if (host) out.set(id, host);
  }
  return out;
};

const unfollow: Hostpages['unfollow'] = async (_db, userId, orgId) => {
  calls.unfollow.push({ userId, orgId });
};

/** Stands in for the whole hostpages module in SP4 tests. */
export const hostpagesModule = { getHostIdentities, unfollow };

const getLocations: Locations['getLocations'] = async (_db, ids) => {
  const out = new Map<string, Location>();
  for (const id of ids) {
    const loc = state.locations.get(id);
    if (loc) out.set(id, loc);
  }
  return out;
};

/** Stands in for the whole locations module in SP4 tests. */
export const locationsModule = { getLocations };
