// In-memory SP2 for SP5 tests. Spread onto the real module:
//   vi.mock('@/modules/listings', async (orig) => ({ ...(await orig()), ...listingsFake }))
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { HostIdentity, HostPageProvider } from '@/modules/hostpages';
import type { ListingContent, ListingHiringInfo, ListingState, ListingSummary, Occupation } from '@/modules/listings';
import type { Actor, ConsumeResult, CreditKind } from '@/modules/entitlements';
import type { ListingAccess, Member, OrgSummary } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';

type Listings = typeof import('@/modules/listings');
type Orgs = typeof import('@/modules/orgs');
type Entitlements = typeof import('@/modules/entitlements');
type Hostpages = typeof import('@/modules/hostpages');

type Call = { name: string; args: unknown[] };

const WHEN: ListingContent['when'] = {
  dates: { mode: 'season', season: 'winter', year: 2026 },
  weeklyHours: 40,
  minCommitment: null,
};
const PAY: ListingContent['pay'] = {
  kind: 'range',
  minCents: 1800,
  maxCents: 2400,
  unit: 'hour',
  crewShareEstimate: null,
  overtime: false,
  tips: false,
  bonuses: null,
  frequency: 'biweekly',
  deductions: null,
};

type StoredListing = ListingHiringInfo & { createdAt: number };

const listings = new Map<string, StoredListing>();
const listingCalls: Call[] = [];
let listingClock = 0;

function listingCall(name: string, args: unknown[]): void {
  listingCalls.push({ name, args });
}

function toInfo(i: Partial<ListingHiringInfo> & { id: string; orgId: string }): ListingHiringInfo {
  return {
    id: i.id,
    orgId: i.orgId,
    locationId: i.locationId ?? null,
    title: i.title ?? 'Lift Operator',
    status: i.status ?? 'active',
    category: i.category ?? 'seasonal',
    secondCategory: i.secondCategory ?? null,
    occupation: i.occupation ?? 'lift-operator',
    startDate: i.startDate ?? '2026-12-01',
    endDate: i.endDate ?? '2027-04-01',
    when: i.when ?? WHEN,
    skills: i.skills ?? [],
    requiredCertifications: i.requiredCertifications ?? [],
    sponsorship: i.sponsorship ?? 'none',
    state: i.state === undefined ? 'CO' : i.state,
    remoteStates: i.remoteStates === undefined ? null : i.remoteStates,
    timezone: i.timezone ?? 'America/Denver',
    pay: i.pay ?? PAY,
    housingProvided: i.housingProvided ?? false,
    mealsProvided: i.mealsProvided ?? false,
    publishedRevisionId: i.publishedRevisionId ?? null,
    closedAt: i.closedAt ?? null,
    notifyMemberIds: i.notifyMemberIds ?? [],
    openings: i.openings ?? 1,
  };
}

export function resetListings(): void {
  listings.clear();
  listingCalls.length = 0;
  listingClock = 0;
}

export function setListing(i: Partial<ListingHiringInfo> & { id: string; orgId: string }): void {
  const prev = listings.get(i.id);
  listings.set(i.id, { ...toInfo(i), createdAt: prev?.createdAt ?? ++listingClock });
}

async function getHiringInfoMany(_db: DbOrTx, ids: string[]): Promise<ListingHiringInfo[]> {
  listingCall('getHiringInfoMany', [ids]);
  return ids.flatMap((id) => {
    const row = listings.get(id);
    return row ? [row] : [];
  });
}

async function listForOrg(
  _db: DbOrTx,
  orgId: string,
  o?: { status?: ListingState[] },
): Promise<
  {
    id: string;
    title: string;
    state: ListingState;
    locationId: string | null;
    publishedRevisionId: string | null;
    firstPublishedAt: Date | null;
    closedAt: Date | null;
  }[]
> {
  listingCall('listForOrg', [orgId, o]);
  return [...listings.values()]
    .filter(
      (row) =>
        row.orgId === orgId && (o?.status === undefined || o.status.length === 0 || o.status.includes(row.status)),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => ({
      id: row.id,
      title: row.title,
      state: row.status,
      locationId: row.locationId,
      publishedRevisionId: row.publishedRevisionId,
      firstPublishedAt: new Date(row.createdAt),
      closedAt: row.closedAt,
    }));
}

async function getListingSummaries(_db: DbOrTx, ids: string[]): Promise<Map<string, ListingSummary>> {
  listingCall('getListingSummaries', [ids]);
  const out = new Map<string, ListingSummary>();
  for (const id of ids) {
    const row = listings.get(id);
    if (!row) continue;
    out.set(id, {
      orgId: row.orgId,
      title: row.title,
      state: row.status,
      locationId: row.locationId,
      primaryCategory: row.category,
      publishedRevisionId: row.publishedRevisionId,
    });
  }
  return out;
}

async function listOccupations(_db: DbOrTx): Promise<Occupation[]> {
  listingCall('listOccupations', []);
  return [];
}

export const listingsFake = {
  getHiringInfoMany,
  listForOrg,
  getListingSummaries,
  listOccupations,
  setListing,
  reset: resetListings,
  calls: listingCalls,
} satisfies Partial<Listings> & {
  setListing: typeof setListing;
  reset: typeof resetListings;
  calls: Call[];
};

const members = new Map<string, Member[]>();
const access = new Map<string, ListingAccess>();
const orgNames = new Map<string, string>();
const orgCalls: Call[] = [];

function orgCall(name: string, args: unknown[]): void {
  orgCalls.push({ name, args });
}

export function resetOrgs(): void {
  members.clear();
  access.clear();
  orgNames.clear();
  orgCalls.length = 0;
}

export function setMembers(orgId: string, rows: Member[]): void {
  members.set(orgId, rows);
}

export function setAccess(userId: string, row: ListingAccess): void {
  access.set(userId, row);
}

export function setOrgName(orgId: string, name: string): void {
  orgNames.set(orgId, name);
}

function accessOf(userId: string): ListingAccess {
  return access.get(userId) ?? { all: false, listingIds: [], locationIds: [] };
}

async function listMembers(_db: DbOrTx, orgId: string): Promise<Member[]> {
  orgCall('listMembers', [orgId]);
  return members.get(orgId) ?? [];
}

async function getListingAccess(_db: DbOrTx, ctx: HostContext): Promise<ListingAccess> {
  orgCall('getListingAccess', [ctx]);
  return accessOf(ctx.user.id);
}

async function canAccessListing(
  _db: DbOrTx,
  ctx: HostContext,
  l: { id: string; locationId: string | null },
): Promise<boolean> {
  orgCall('canAccessListing', [ctx, l]);
  const row = accessOf(ctx.user.id);
  if (row.all) return true;
  return row.listingIds.includes(l.id) || (l.locationId !== null && row.locationIds.includes(l.locationId));
}

function summary(id: string): OrgSummary {
  return {
    id,
    clerkOrgId: `org_${id.replace(/-/g, '').slice(0, 10)}`,
    name: orgNames.get(id) ?? 'Org',
    slug: 'org',
    status: 'active',
    deleted: false,
    websiteUrl: null,
    requireRecruiterApproval: false,
    primaryLocationId: null,
    verificationStatus: 'unverified',
    ownerUserId: null,
    createdAt: new Date(0),
  };
}

async function getOrgSummaries(_db: DbOrTx, ids: string[]): Promise<Map<string, OrgSummary>> {
  orgCall('getOrgSummaries', [ids]);
  return new Map(ids.map((id) => [id, summary(id)]));
}

export const orgsFake = {
  listMembers,
  getListingAccess,
  canAccessListing,
  getOrgSummaries,
  setMembers,
  setAccess,
  setOrgName,
  reset: resetOrgs,
  calls: orgCalls,
} satisfies Partial<Orgs> & {
  setMembers: typeof setMembers;
  setAccess: typeof setAccess;
  setOrgName: typeof setOrgName;
  reset: typeof resetOrgs;
  calls: Call[];
};

type Spent = {
  id: string;
  orgId: string;
  kind: CreditKind;
  quantity: number;
  remaining: number;
};

const balances = new Map<string, number>();
const spent = new Map<string, Spent>();
const entitlementCalls: Call[] = [];

function balanceKey(orgId: string, kind: CreditKind): string {
  return `${orgId}:${kind}`;
}

export function resetEntitlements(): void {
  balances.clear();
  spent.clear();
  entitlementCalls.length = 0;
}

export function setCredits(orgId: string, n: number): void {
  balances.set(balanceKey(orgId, 'invite_credit'), n);
}

async function getBalance(
  _db: DbOrTx,
  orgId: string,
  kind: CreditKind,
): Promise<{ balance: number; resetsAt: Date | null }> {
  entitlementCalls.push({ name: 'getBalance', args: [orgId, kind] });
  return { balance: balances.get(balanceKey(orgId, kind)) ?? 0, resetsAt: null };
}

async function consume(
  _db: DbOrTx,
  i: {
    orgId: string;
    kind: CreditKind;
    quantity?: number;
    subjectType: string;
    subjectId: string;
    idempotencyKey: string;
    actor: Actor;
  },
): Promise<ConsumeResult> {
  entitlementCalls.push({ name: 'consume', args: [i] });
  const existing = spent.get(i.idempotencyKey);
  if (existing) {
    return { ok: true, consumptionId: existing.id, remaining: balances.get(balanceKey(existing.orgId, existing.kind)) ?? 0 };
  }
  const quantity = i.quantity ?? 1;
  const key = balanceKey(i.orgId, i.kind);
  const balance = balances.get(key) ?? 0;
  if (balance < quantity) return { ok: false, reason: 'insufficient', remaining: balance };
  const remaining = balance - quantity;
  balances.set(key, remaining);
  const row = { id: newId(), orgId: i.orgId, kind: i.kind, quantity, remaining };
  spent.set(i.idempotencyKey, row);
  return { ok: true, consumptionId: row.id, remaining };
}

async function reverse(_db: DbOrTx, consumptionId: string, reason: string, actor: Actor): Promise<void> {
  entitlementCalls.push({ name: 'reverse', args: [consumptionId, reason, actor] });
  const row = [...spent.values()].find((item) => item.id === consumptionId);
  if (!row) throw notFound('Consumption not found');
  const key = balanceKey(row.orgId, row.kind);
  balances.set(key, (balances.get(key) ?? 0) + row.quantity);
}

export const entitlementsFake = {
  consume,
  getBalance,
  reverse,
  setCredits,
  reset: resetEntitlements,
  calls: entitlementCalls,
} satisfies Partial<Entitlements> & {
  setCredits: typeof setCredits;
  reset: typeof resetEntitlements;
  calls: Call[];
};

const followers = new Map<string, number>();
const identities = new Map<string, HostIdentity>();
const providers = new Map<HostPageProvider['kind'], HostPageProvider>();
const hostpageCalls: Call[] = [];

export function resetHostpages(): void {
  followers.clear();
  identities.clear();
  providers.clear();
  hostpageCalls.length = 0;
}

export function setFollowers(orgId: string, n: number): void {
  followers.set(orgId, n);
}

async function countFollowersAt(_db: DbOrTx, orgId: string, at: Date): Promise<number> {
  hostpageCalls.push({ name: 'countFollowersAt', args: [orgId, at] });
  return followers.get(orgId) ?? 0;
}

async function getHostIdentities(_db: DbOrTx, orgIds: string[]): Promise<Map<string, HostIdentity>> {
  hostpageCalls.push({ name: 'getHostIdentities', args: [orgIds] });
  const out = new Map<string, HostIdentity>();
  for (const id of orgIds) {
    const row = identities.get(id);
    if (row) out.set(id, row);
  }
  return out;
}

function registerHostPageProvider(p: HostPageProvider): void {
  hostpageCalls.push({ name: 'registerHostPageProvider', args: [p] });
  providers.set(p.kind, p);
}

export const hostpagesFake = {
  countFollowersAt,
  getHostIdentities,
  registerHostPageProvider,
  setFollowers,
  reset: resetHostpages,
  calls: hostpageCalls,
  providers,
} satisfies Partial<Hostpages> & {
  setFollowers: typeof setFollowers;
  reset: typeof resetHostpages;
  calls: Call[];
  providers: typeof providers;
};
