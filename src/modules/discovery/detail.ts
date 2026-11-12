// The public listing detail (SP3 spec 8.9, plan Task 21).
//
// - Active listings are read from SP2 on every request (getPublishedListing) and their card is
//   built from that fresh data through buildProjectionRow and rowToCard, so a takedown applies
//   at once and a stale projection row is never shown for an active listing.
// - A closed listing renders from its inactive projection row; anything else is null (a 404).
// - The activity line counts days in the viewer's zone. The public content omits the host's
//   notify list, and an additional step is returned only when its URL is https.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  daysBetween,
  todayIn,
  type DispositionState,
  type JobCardData,
  type ListingDetail,
} from '@/lib/discovery';
import { logger } from '@/lib/logger';
import { GENRES } from '@/lib/taxonomy';
import {
  getListingSummaries,
  getPublishedListing,
  listOccupations,
  type ListingContent,
  type PublishedListing,
} from '@/modules/listings';
import { getLocations, listDestinations } from '@/modules/locations';
import { boostedLabels, loadCards, rowToCard } from './cards';
import { overlayApplied } from './hooks';
import { mediaAlt, publicMediaUrls } from './media';
import { buildProjectionRow } from './projection';
import type { ProjectionRow, ProjectionRowInput } from './projection-columns';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Urls = Map<string, Record<320 | 640 | 1280, string>>;

/** Host identities, loaded on first use (see hostIdentities in sync.ts for why). */
async function hostIdentities(db: DbOrTx, orgIds: string[]) {
  const { getHostIdentities } = await import('@/modules/hostpages');
  return getHostIdentities(db, orgIds);
}

/** The gallery, housing and meal photos of the listing. */
function photoIds(c: ListingContent): string[] {
  return [
    ...c.photos.galleryMediaIds,
    ...(c.housing.provided ? Object.values(c.housing.photos) : []),
    ...(c.meals.provided ? Object.values(c.meals.photos) : []),
  ];
}

/** The projection row SP2's current data gives, with every photo URL; null if unreadable. */
async function freshRow(
  db: DbOrTx,
  published: PublishedListing,
  now: Date,
): Promise<{ row: ProjectionRowInput; urls: Urls; destinationName: string | null } | null> {
  const c = published.content;
  const locationId = c.where.mode === 'remote' ? c.where.hostLocationId : c.where.locationId;
  const host = (await hostIdentities(db, [published.orgId])).get(published.orgId);
  const location = (await getLocations(db, [locationId])).get(locationId);
  if (!host || !location) {
    logger.warn('discovery.detail_unavailable', {
      listingId: published.listingId,
      missing: host ? 'location' : 'host',
    });
    return null;
  }
  const coverId = c.photos.coverMediaId;
  const urls = await publicMediaUrls(db, [
    coverId,
    ...(host.logoMediaId ? [host.logoMediaId] : []),
    ...photoIds(c),
  ]);
  const coverSrc = urls.get(coverId);
  const alt = coverSrc ? (await mediaAlt(db, [coverId])).get(coverId) : null;
  const occupations = await listOccupations(db);
  const destinationSlug =
    c.genreDetails.category === 'seasonal' ? c.genreDetails.destinationSlug : null;
  const destinationName = destinationSlug
    ? ((await listDestinations(db)).find((d) => d.slug === destinationSlug)?.name ?? null)
    : null;
  const row = buildProjectionRow({
    published,
    host,
    location,
    hostLogoUrl: host.logoMediaId ? (urls.get(host.logoMediaId)?.[320] ?? null) : null,
    cover: coverSrc ? { src: coverSrc, alt: alt || c.basics.title } : null,
    occupationLabel:
      occupations.find((o) => o.code === c.basics.occupationCode)?.label ?? c.basics.title,
    genreLabel: GENRES.find((g) => g.code === c.basics.genre)?.label ?? c.basics.genre,
    destinationName,
    now,
  });
  return { row, urls, destinationName };
}

/** The row as the projection would read it back. */
function asRow(r: ProjectionRowInput, now: Date): ProjectionRow {
  const { vector: _vector, ...rest } = r;
  return {
    ...rest,
    publishedAt: r.publishedAt.toISOString(),
    firstActiveAt: r.firstActiveAt.toISOString(),
    indexedAt: r.indexedAt.toISOString(),
    confirmedActiveAt: r.confirmedActiveAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function viewerState(
  db: DbOrTx,
  viewerUserId: string | null,
  listingId: string,
): Promise<JobCardData['viewer']> {
  if (!viewerUserId || !UUID.test(viewerUserId)) return null;
  const [d] = await queryRows<{ state: DispositionState }>(
    db,
    sql`select state from app.listing_dispositions
      where user_id = ${viewerUserId}::uuid and listing_id = ${listingId}::uuid`,
  );
  const applied = await overlayApplied(db, viewerUserId, [listingId]);
  return { disposition: d?.state ?? null, applied: applied.has(listingId) };
}

/** "Confirmed active today", "Confirmed active 1 day ago", "Posted 5 days ago". */
function activityLine(p: PublishedListing, today: string, tz: string): string {
  const at = p.confirmedActiveAt ?? p.firstPublishedAt;
  const days = Math.max(0, daysBetween(todayIn(tz, at), today));
  const when = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return `${p.confirmedActiveAt ? 'Confirmed active' : 'Posted'} ${when}`;
}

const DOCUMENTS = { twic: 'TWIC', mmc: 'MMC', stcw: 'STCW' } as const;
const TRAVEL = { none: 'None', occasional: 'Occasional', regular: 'Regular' } as const;

/** The category's labeled fields, leaving out empty values. */
function categoryFields(
  d: ListingContent['genreDetails'],
  destinationName: string | null,
): { label: string; value: string }[] {
  const list = (v: readonly string[]) => v.join(', ');
  let fields: [string, string | null][];
  switch (d.category) {
    case 'maritime':
      fields = [
        ['Vessel type', d.vesselType],
        ['Home port', d.homePort],
        ['Rotation', d.rotation],
        ['Time at sea', d.timeAtSea],
        ['Documents', list(d.documents.map((x) => DOCUMENTS[x]))],
      ];
      break;
    case 'seasonal':
      fields = [
        ['Destination', destinationName],
        ['Staff perks', list(d.staffPerks)],
      ];
      break;
    case 'farm':
      fields = [
        ['Type of operation', d.operationType],
        ['Harvest window', d.harvestWindow],
        ['Equipment', list(d.equipment)],
        ['Certifications', list(d.certifications)],
      ];
      break;
    case 'remote':
      fields = [
        ['Time zone overlap', d.timeZoneOverlap],
        ['Equipment provided', d.equipmentProvided],
        ['Internet', d.internet],
        ['Travel', TRAVEL[d.travel]],
      ];
      break;
  }
  return fields.flatMap(([label, value]) => (value?.trim() ? [{ label, value }] : []));
}

/**
 * Listing content a seeker or guest may see. `notifyMemberIds` is the host's staff list, and
 * `additionalStep` is the https-checked step (or null), never the stored URL.
 */
function publicContent(c: ListingContent): ListingContent {
  const step = additionalStep(c);
  const { notifyMemberIds: _notifyMemberIds, ...applying } = c.applying;
  return {
    ...c,
    applying: {
      ...applying,
      additionalStep: step ? { note: step.note, url: step.url } : null,
    },
  } as ListingContent;
}

/** The employer's extra step, only for https URLs. */
function additionalStep(c: ListingContent): ListingDetail['additionalStep'] {
  const step = c.applying.additionalStep;
  if (!step) return null;
  try {
    const url = new URL(step.url);
    if (url.protocol !== 'https:' || !url.hostname) return null;
    return { note: step.note, url: step.url, domain: url.hostname };
  } catch {
    return null;
  }
}

/** The deadline, else the fixed end date, else null. */
function validThrough(c: ListingContent): string | null {
  if (c.applying.deadline) return c.applying.deadline;
  return c.when.dates.mode === 'fixed' ? c.when.dates.end : null;
}

/** The closed card from its inactive row, when SP2 says the listing is closed. */
async function closedDetail(
  db: DbOrTx,
  i: { listingId: string; viewerUserId: string | null; tz: string },
): Promise<{ status: 'closed'; card: JobCardData } | null> {
  const summary = (await getListingSummaries(db, [i.listingId])).get(i.listingId);
  if (summary?.state !== 'closed') return null;
  const [card] = await loadCards(db, [i.listingId], {
    viewerUserId: i.viewerUserId,
    tz: i.tz,
    source: 'other',
    includeClosed: true,
  });
  return card?.status === 'closed' ? { status: 'closed', card } : null;
}

export async function getListingDetail(
  db: DbOrTx,
  i: { listingId: string; viewerUserId: string | null; tz: string },
): Promise<ListingDetail | { status: 'closed'; card: JobCardData } | null> {
  if (!UUID.test(i.listingId)) return null;
  const published = await getPublishedListing(db, i.listingId);
  if (!published) return closedDetail(db, i);

  const now = new Date();
  const fresh = await freshRow(db, published, now);
  if (!fresh) return null;
  const today = todayIn(i.tz, now);
  const boostId = (await boostedLabels(db, [i.listingId], now)).get(i.listingId) ?? null;
  const card = rowToCard(asRow(fresh.row, now), {
    today,
    source: 'other',
    viewer: await viewerState(db, i.viewerUserId, i.listingId),
    boostId,
  });
  const c = published.content;
  const photoUrls: ListingDetail['photoUrls'] = {};
  for (const id of photoIds(c)) {
    const src = fresh.urls.get(id);
    if (src) photoUrls[id] = src;
  }
  return {
    ...card,
    content: publicContent(c),
    revisionId: published.revisionId,
    publishedAt: published.firstPublishedAt.toISOString(),
    photoUrls,
    activityLine: activityLine(published, today, i.tz),
    categoryFields: categoryFields(c.genreDetails, fresh.destinationName),
    additionalStep: additionalStep(c),
    validThrough: validThrough(c),
  };
}
