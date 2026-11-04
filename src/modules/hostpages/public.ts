// The public host page (/hosts/[slug]) and the host identities other surfaces show (SP2 spec
// sections 3, 7 and 8.5). A page is public while its org is active and not deleted, once the org
// has been entitled at least once (`host_pages.first_public_at`). Only approved media is shown.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { CATEGORIES, type Category } from '@/lib/taxonomy';
import { getSubscriberBadges } from '@/modules/billing';
import { getOrgListingFacts, getOrgListingStats, type PublishedListing } from '@/modules/listings';
import {
  getLocations,
  getWeather,
  listOrgLocations,
  type WeatherCondition,
} from '@/modules/locations';
import { getMediaInfo } from '@/modules/media';
import { getOrgSummaries, resolveSlug, type OrgSummary } from '@/modules/orgs';
import { getSetting } from '@/modules/settings';
import type { HostPageContent } from './content';
import { readContent } from './editor';
import { getHostPageProvider, type PinnedAnnouncement, type Tally } from './providers';
import { hostFollows, hostPages } from './schema';
import { usuallyHires } from './usually-hires';

/** Product display thresholds (spec 8.5). */
export const FOLLOWERS_SHOWN_FROM = 26;
export const REPLY_TIME_MIN_CONVERSATIONS = 10;
export const AS_DESCRIBED_MIN_RESPONSES = 5;

export type HostIdentity = {
  orgId: string;
  name: string;
  slug: string;
  logoMediaId: string | null;
  coverMediaId: string | null;
  subscriber: { hostSince: Date } | null;
  hiringNow: boolean;
  homeLocation: { city: string; state: string } | null;
};

export type HostPageJobGroup = {
  location: {
    id: string;
    name: string;
    city: string;
    state: string;
    /** Only for a location shown at `exact` precision. */
    addressLine1: string | null;
    weather: { temperatureF: number; condition: WeatherCondition; shortForecast: string } | null;
  };
  listings: PublishedListing[];
};

export type HostPagePublic = {
  identity: HostIdentity & { websiteUrl: string | null; memberSince: Date; categories: Category[] };
  stats: { openJobs: number; locations: number; followers: number | null };
  notHiring: { line: string } | null;
  replyTime: { withinADay: boolean } | null;
  asDescribed: { responses: number; housing: Tally; meals: Tally; pay: Tally } | null;
  announcements: PinnedAnnouncement[];
  jobs: HostPageJobGroup[];
  about: HostPageContent['about'];
  photos: HostPageContent['photos'];
  team: HostPageContent['team'] | null;
  faq: HostPageContent['faq'] | null;
  following: boolean;
  noindex: boolean;
};

export type ResolvedHostPage =
  | { kind: 'page'; page: HostPagePublic }
  | { kind: 'redirect'; slug: string }
  | { kind: 'not_found' };

type PublicOrg = { summary: OrgSummary; content: HostPageContent };

/** The public orgs among `orgIds`, with their live content. */
async function loadPublicOrgs(db: DbOrTx, orgIds: string[]): Promise<Map<string, PublicOrg>> {
  const out = new Map<string, PublicOrg>();
  const ids = [...new Set(orgIds)];
  if (ids.length === 0) return out;
  const rows = await db
    .select({ orgId: hostPages.orgId, content: hostPages.content })
    .from(hostPages)
    .where(and(inArray(hostPages.orgId, ids), sql`${hostPages.firstPublicAt} is not null`));
  if (rows.length === 0) return out;
  const summaries = await getOrgSummaries(
    db,
    rows.map((r) => r.orgId),
  );
  for (const r of rows) {
    const summary = summaries.get(r.orgId);
    if (!summary || summary.deleted || summary.status !== 'active') continue;
    out.set(r.orgId, { summary, content: readContent(r.content) });
  }
  return out;
}

/** The media ids among `ids` that are approved and belong to `orgId`'s org. */
async function approvedMedia(
  db: DbOrTx,
  wanted: { orgId: string; id: string | null }[],
): Promise<Set<string>> {
  const ids = wanted.flatMap((w) => (w.id ? [w.id] : []));
  const info = await getMediaInfo(db, ids);
  const out = new Set<string>();
  for (const w of wanted) {
    const m = w.id ? info.get(w.id) : undefined;
    if (w.id && m && m.status === 'approved' && m.ownerOrgId === w.orgId) out.add(w.id);
  }
  return out;
}

async function buildIdentities(
  db: DbOrTx,
  orgs: Map<string, PublicOrg>,
): Promise<Map<string, HostIdentity>> {
  const out = new Map<string, HostIdentity>();
  const ids = [...orgs.keys()];
  if (ids.length === 0) return out;

  const badges = await getSubscriberBadges(db, ids);
  const stats = await getOrgListingStats(db, ids);
  const media = await approvedMedia(
    db,
    [...orgs.values()].flatMap((o) => [
      { orgId: o.summary.id, id: o.content.logoMediaId },
      { orgId: o.summary.id, id: o.content.coverMediaId },
    ]),
  );
  const homeIds = [...orgs.values()].flatMap((o) =>
    o.summary.primaryLocationId ? [o.summary.primaryLocationId] : [],
  );
  const homes = homeIds.length > 0 ? await getLocations(db, homeIds) : new Map();

  for (const [orgId, { summary, content }] of orgs) {
    const badge = badges.get(orgId);
    const home = summary.primaryLocationId ? homes.get(summary.primaryLocationId) : undefined;
    const shown = (id: string | null) => (id && media.has(id) ? id : null);
    out.set(orgId, {
      orgId,
      name: summary.name,
      slug: summary.slug,
      logoMediaId: shown(content.logoMediaId),
      coverMediaId: shown(content.coverMediaId),
      subscriber: badge ? { hostSince: badge.hostSince } : null,
      hiringNow: (stats.get(orgId)?.active ?? 0) > 0,
      homeLocation: home ? { city: home.city, state: home.state } : null,
    });
  }
  return out;
}

/** SP3 cards and map previews: the public hosts among `orgIds` (others are left out). */
export async function getHostIdentities(
  db: DbOrTx,
  orgIds: string[],
): Promise<Map<string, HostIdentity>> {
  return buildIdentities(db, await loadPublicOrgs(db, orgIds));
}

/** SP3 sitemaps: public host slugs in slug order. Pass `next` back as `after`. */
export async function listPublicHostSlugs(
  db: DbOrTx,
  i: { after?: string; limit: number },
): Promise<{ items: { slug: string; updatedAt: Date }[]; next: string | null }> {
  const limit = Math.max(1, Math.min(1000, Math.floor(i.limit)));
  // Reads app.organizations (read-only; orgs owns it) for the slug order and the org's
  // updated_at, which OrgSummary doesn't carry.
  const rows = await queryRows<{ slug: string; updated_at: string }>(
    db,
    sql`
      select o.slug,
        to_char(greatest(o.updated_at, p.updated_at) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
      from app.host_pages p
      join app.organizations o on o.id = p.org_id
      where p.first_public_at is not null
        and o.status = 'active'
        and o.deleted_at is null
        ${i.after ? sql`and o.slug > ${i.after}` : sql``}
      order by o.slug
      limit ${limit + 1}
    `,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({ slug: r.slug, updatedAt: new Date(r.updated_at) })),
    next: rows.length > limit && last ? last.slug : null,
  };
}

/** A provider's answer, or `fallback` when it fails: a broken slot never takes the page down. */
async function fromProvider<T>(kind: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    logger.warn('host page provider failed; hiding its slot', { kind, err });
    return fallback;
  }
}

function locationOf(l: PublishedListing): string {
  const where = l.content.where;
  return where.mode === 'remote' ? where.hostLocationId : where.locationId;
}

function orderedCategories(categories: Iterable<Category>): Category[] {
  const set = new Set(categories);
  return CATEGORIES.filter((c) => set.has(c));
}

async function buildPage(
  db: DbOrTx,
  org: PublicOrg,
  identity: HostIdentity,
  viewer: { userId: string | null },
): Promise<HostPagePublic> {
  const orgId = org.summary.id;
  const { content } = org;
  const facts = await getOrgListingFacts(db, orgId);
  const orgLocations = (await listOrgLocations(db, orgId)).filter((l) => !l.archived);

  const categories = orderedCategories(
    facts.active.length > 0
      ? facts.active.map((l) => l.content.basics.primaryCategory)
      : facts.history.map((h) => h.primaryCategory),
  );

  let notHiring: { line: string } | null = null;
  if (facts.active.length === 0) {
    const months = usuallyHires(facts.history.map((h) => h.firstPublishedAt));
    notHiring = {
      line: months ? `Not hiring right now · Usually hires ${months}` : 'Not hiring right now',
    };
  }

  // Jobs grouped by location: the home location first, then by name; newest listings first.
  const byLocation = new Map<string, PublishedListing[]>();
  for (const l of facts.active) {
    const id = locationOf(l);
    byLocation.set(id, [...(byLocation.get(id) ?? []), l]);
  }
  const groupIds = [...byLocation.keys()];
  const locations = groupIds.length > 0 ? await getLocations(db, groupIds) : new Map();
  const weather = groupIds.length > 0 ? await getWeather(db, groupIds) : new Map();
  const jobs: HostPageJobGroup[] = [];
  for (const [id, listings] of byLocation) {
    const loc = locations.get(id);
    if (!loc) continue;
    const w = weather.get(id);
    jobs.push({
      location: {
        id,
        name: loc.name,
        city: loc.city,
        state: loc.state,
        addressLine1: loc.publicPrecision === 'exact' ? loc.publicAddressLine1 : null,
        weather: w
          ? { temperatureF: w.temperatureF, condition: w.condition, shortForecast: w.shortForecast }
          : null,
      },
      listings: [...listings].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
    });
  }
  const home = org.summary.primaryLocationId;
  jobs.sort((a, b) =>
    a.location.id === home
      ? -1
      : b.location.id === home
        ? 1
        : a.location.name.localeCompare(b.location.name),
  );

  const [followerRow] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.host_follows where org_id = ${orgId}`,
  );
  const followers = followerRow?.n ?? 0;

  const following = viewer.userId
    ? (
        await db
          .select({ orgId: hostFollows.orgId })
          .from(hostFollows)
          .where(and(eq(hostFollows.userId, viewer.userId), eq(hostFollows.orgId, orgId)))
          .limit(1)
      ).length > 0
    : false;

  const replyProvider = getHostPageProvider('reply_time');
  const reply = replyProvider
    ? await fromProvider('reply_time', () => replyProvider.fn(db, orgId), null)
    : null;
  const describedProvider = getHostPageProvider('as_described');
  const described = describedProvider
    ? await fromProvider('as_described', () => describedProvider.fn(db, orgId), null)
    : null;
  const pinnedProvider = getHostPageProvider('pinned_announcement');
  const announcements = pinnedProvider
    ? await fromProvider('pinned_announcement', () => pinnedProvider.fn(db, orgId), [])
    : [];

  const media = await approvedMedia(db, [
    ...content.photos.map((p) => ({ orgId, id: p.mediaId })),
    ...content.team.map((m) => ({ orgId, id: m.mediaId })),
  ]);
  const showTeam = content.teamConsent && content.team.length > 0;

  const launchAt = await getSetting(db, 'launch.public_at');

  return {
    identity: {
      ...identity,
      websiteUrl: org.summary.websiteUrl,
      memberSince: org.summary.createdAt,
      categories,
    },
    stats: {
      openJobs: facts.active.length,
      locations: orgLocations.length,
      followers: followers >= FOLLOWERS_SHOWN_FROM ? followers : null,
    },
    notHiring,
    replyTime:
      reply && reply.conversations >= REPLY_TIME_MIN_CONVERSATIONS && reply.withinADay
        ? { withinADay: true }
        : null,
    asDescribed:
      described && described.responses >= AS_DESCRIBED_MIN_RESPONSES
        ? {
            responses: described.responses,
            housing: described.housing,
            meals: described.meals,
            pay: described.pay,
          }
        : null,
    announcements,
    jobs,
    about: content.about,
    photos: content.photos.filter((p) => media.has(p.mediaId)),
    team: showTeam
      ? content.team.map((m) => ({
          ...m,
          mediaId: m.mediaId && media.has(m.mediaId) ? m.mediaId : null,
        }))
      : null,
    faq: content.faq.length > 0 ? content.faq : null,
    following,
    noindex: launchAt === null || new Date(launchAt).getTime() > Date.now(),
  };
}

/**
 * The public page for `slug`: the page, a redirect to the current slug when `slug` is retired,
 * or not_found (unknown slug, deleted, suspended or banned org, or never entitled).
 */
export async function resolveHostPage(
  db: DbOrTx,
  slug: string,
  viewer: { userId: string | null },
): Promise<ResolvedHostPage> {
  const resolved = await resolveSlug(db, slug);
  if (!resolved) return { kind: 'not_found' };
  const orgs = await loadPublicOrgs(db, [resolved.orgId]);
  const org = orgs.get(resolved.orgId);
  if (!org) return { kind: 'not_found' };
  if (resolved.retired) return { kind: 'redirect', slug: resolved.currentSlug };

  const identity = (await buildIdentities(db, orgs)).get(resolved.orgId);
  if (!identity) return { kind: 'not_found' };
  return { kind: 'page', page: await buildPage(db, org, identity, viewer) };
}

/** Whether the org's page is public now. */
export async function isPublicHost(db: DbOrTx, orgId: string): Promise<boolean> {
  return (await loadPublicOrgs(db, [orgId])).has(orgId);
}
