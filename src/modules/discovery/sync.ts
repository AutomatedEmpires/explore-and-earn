// Projection sync from SP2 events, the host fan-out and the nightly drift check (SP3 spec
// section 6, plan Tasks 8 and 9).
//
// syncListing always re-reads SP2 under a per-listing advisory lock, whatever event woke it,
// so concurrent syncs of one listing end in the state SP2 holds last:
// - active: the listing, its host and its location are read and the row is upserted. A missing
//   read throws, so the outbox retries (and the drift check repairs what still fails).
// - closed: the row stays, inactive, with closed_at set.
// - anything else, or no listing at all: the row goes, and in the same transaction the
//   listing's dispositions and alert matches (spec failure mode 1).
import { sql } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { enqueue, type HandlerMap } from '@/modules/jobs';
import {
  GENRES,
  getListingSummaries,
  getPublishedListing,
  listActiveListings,
  listOccupations,
  type PublishedListing,
} from '@/modules/listings';
import { getLocations, listDestinations } from '@/modules/locations';
import { raiseAlert } from '@/modules/trust';
import { mediaAlt, publicMediaUrls } from './media';
import { buildProjectionRow, upsertProjectionRow } from './projection';
import type { ProjectionRowInput } from './projection-columns';

export type SyncResult = 'upserted' | 'closed' | 'removed';

/** Projection rows re-synced per sync_host job. */
export const HOST_PAGE_SIZE = 100;
/** Listings per page in each drift-check pass. */
export const DRIFT_PAGE_SIZE = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const idList = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/** Occupation labels and destination names, read once per batch. */
type Lookups = { occupations: Map<string, string>; destinations: Map<string, string> };

async function loadLookups(db: DbOrTx): Promise<Lookups> {
  const [occupations, destinations] = [await listOccupations(db), await listDestinations(db)];
  return {
    occupations: new Map(occupations.map((o) => [o.code, o.label])),
    destinations: new Map(destinations.map((d) => [d.slug, d.name])),
  };
}

/**
 * Host identities, with hostpages loaded on the first sync rather than when discovery loads.
 * hostpages registers its weather filter with locations as it loads, so loading it eagerly
 * would break the tests that import discovery with @/modules/locations replaced by the SP2
 * fake alone (tests/fakes/fakes.test.ts).
 */
async function hostIdentities(db: DbOrTx, orgIds: string[]) {
  const { getHostIdentities } = await import('@/modules/hostpages');
  return getHostIdentities(db, orgIds);
}

/** The row for an active listing; throws when its host or location can't be read. */
async function rowFor(
  tx: Tx,
  published: PublishedListing,
  now: Date,
  lookups: Lookups,
): Promise<ProjectionRowInput> {
  const c = published.content;
  const locationId = c.where.mode === 'remote' ? c.where.hostLocationId : c.where.locationId;
  const host = (await hostIdentities(tx, [published.orgId])).get(published.orgId);
  if (!host) throw new Error(`discovery.sync: host ${published.orgId} is not public`);
  const location = (await getLocations(tx, [locationId])).get(locationId);
  if (!location) throw new Error(`discovery.sync: location ${locationId} not found`);

  const coverId = c.photos.coverMediaId;
  const urls = await publicMediaUrls(
    tx,
    host.logoMediaId ? [coverId, host.logoMediaId] : [coverId],
  );
  const coverSrc = urls.get(coverId);
  const alt = coverSrc ? (await mediaAlt(tx, [coverId])).get(coverId) : null;
  const genre = GENRES.find((g) => g.code === c.basics.genre);
  const destinationSlug =
    c.genreDetails.category === 'seasonal' ? c.genreDetails.destinationSlug : null;

  return buildProjectionRow({
    published,
    host,
    location,
    hostLogoUrl: host.logoMediaId ? (urls.get(host.logoMediaId)?.[320] ?? null) : null,
    cover: coverSrc ? { src: coverSrc, alt: alt || c.basics.title } : null,
    occupationLabel: lookups.occupations.get(c.basics.occupationCode) ?? c.basics.title,
    genreLabel: genre?.label ?? c.basics.genre,
    destinationName: destinationSlug ? (lookups.destinations.get(destinationSlug) ?? null) : null,
    now,
  });
}

/** Deletes the row with the listing's dispositions and alert matches. */
async function removeListing(tx: Tx, listingId: string): Promise<void> {
  await tx.execute(sql`delete from app.saved_search_matches where listing_id = ${listingId}::uuid`);
  await tx.execute(sql`delete from app.listing_dispositions where listing_id = ${listingId}::uuid`);
  await tx.execute(sql`delete from app.discovery_listings where listing_id = ${listingId}::uuid`);
}

async function syncWith(
  db: Db,
  listingId: string,
  now: Date,
  lookups: Lookups,
): Promise<SyncResult> {
  if (!isUuid(listingId)) return 'removed';
  return withTx(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`discovery:${listingId}`}))::text`,
    );
    const summary = (await getListingSummaries(tx, [listingId])).get(listingId);
    if (summary?.state === 'active') {
      const published = await getPublishedListing(tx, listingId);
      if (!published) throw new Error(`discovery.sync: listing ${listingId} has no live revision`);
      await upsertProjectionRow(tx, await rowFor(tx, published, now, lookups));
      return 'upserted';
    }
    if (summary?.state === 'closed') {
      await tx.execute(sql`
        update app.discovery_listings
        set is_active = false, closed_at = coalesce(closed_at, ${now.toISOString()}::timestamptz)
        where listing_id = ${listingId}::uuid
      `);
      return 'closed';
    }
    await removeListing(tx, listingId);
    return 'removed';
  });
}

/** Brings one listing's projection row in line with SP2 (spec section 6). */
export async function syncListing(db: Db, listingId: string, now: Date): Promise<SyncResult> {
  return syncWith(db, listingId, now, await loadLookups(db));
}

/**
 * Re-syncs up to 100 projection rows of the org (or of one of its locations), in listing_id
 * order after `after`. `next` is the last id synced when more rows follow.
 */
export async function syncHost(
  db: Db,
  i: { orgId: string; locationId?: string; after?: string },
  now: Date,
): Promise<{ synced: number; next: string | null }> {
  const rows = await queryRows<{ id: string }>(
    db,
    sql`
      select listing_id::text as id from app.discovery_listings
      where org_id = ${i.orgId}::uuid
        ${i.locationId ? sql`and location_id = ${i.locationId}::uuid` : sql``}
        ${i.after ? sql`and listing_id > ${i.after}::uuid` : sql``}
      order by listing_id
      limit ${HOST_PAGE_SIZE + 1}
    `,
  );
  const page = rows.slice(0, HOST_PAGE_SIZE);
  if (page.length === 0) return { synced: 0, next: null };
  const lookups = await loadLookups(db);
  for (const r of page) await syncWith(db, r.id, now, lookups);
  return {
    synced: page.length,
    next: rows.length > HOST_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
  };
}

type Counts = { upserted: number; removed: number };

/**
 * The two drift passes: every SP2 listing whose row is missing, inactive or on another
 * revision, then every active row SP2 no longer reports as active.
 */
async function reconcile(db: Db, now: Date): Promise<Counts> {
  const lookups = await loadLookups(db);
  const counts: Counts = { upserted: 0, removed: 0 };
  const tally = (r: SyncResult) => {
    if (r === 'upserted') counts.upserted++;
    else counts.removed++;
  };

  let after: string | undefined;
  for (;;) {
    const page = await listActiveListings(db, { after, limit: DRIFT_PAGE_SIZE });
    const ids = page.items.map((l) => l.listingId);
    const rows =
      ids.length === 0
        ? []
        : await queryRows<{ id: string; revision: string; active: boolean }>(
            db,
            sql`select listing_id::text as id, revision_id::text as revision, is_active as active
              from app.discovery_listings where listing_id in (${idList(ids)})`,
          );
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const l of page.items) {
      const row = byId.get(l.listingId);
      if (row && row.active && row.revision === l.revisionId) continue;
      tally(await syncWith(db, l.listingId, now, lookups));
    }
    if (!page.next) break;
    after = page.next;
  }

  let cursor: string | null = null;
  for (;;) {
    const rows: { id: string }[] = await queryRows<{ id: string }>(
      db,
      sql`select listing_id::text as id from app.discovery_listings
        where is_active ${cursor ? sql`and listing_id > ${cursor}::uuid` : sql``}
        order by listing_id limit ${DRIFT_PAGE_SIZE}`,
    );
    if (rows.length === 0) break;
    const summaries = await getListingSummaries(
      db,
      rows.map((r) => r.id),
    );
    for (const r of rows) {
      if (summaries.get(r.id)?.state === 'active') continue;
      tally(await syncWith(db, r.id, now, lookups));
    }
    if (rows.length < DRIFT_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]?.id ?? null;
  }
  return counts;
}

/** The nightly repair (spec section 6). Any repair is audited and raises a warning alert. */
export async function driftCheck(
  db: Db,
  now: Date,
): Promise<{ upserted: number; removed: number; repaired: number }> {
  const counts = await reconcile(db, now);
  const result = { ...counts, repaired: counts.upserted + counts.removed };
  if (result.repaired > 0) {
    await record(db, {
      actorType: 'system',
      actorId: null,
      action: 'discovery.drift_repaired',
      subjectType: 'discovery_projection',
      subjectId: null,
      data: result,
    });
    await raiseAlert(db, {
      severity: 'warning',
      kind: 'discovery.drift',
      message: 'Search projection drifted from listings',
      data: result,
    });
  }
  return result;
}

/** The drift check without paging limits (SP8 restore runbook); always audited. */
export async function rebuildSearchProjection(
  db: Db,
): Promise<{ upserted: number; removed: number }> {
  const counts = await reconcile(db, new Date());
  await record(db, {
    actorType: 'system',
    actorId: null,
    action: 'discovery.projection_rebuilt',
    subjectType: 'discovery_projection',
    subjectId: null,
    data: counts,
  });
  return counts;
}

/**
 * A handler's fields: an event envelope's `data` (SP2 events), or the payload itself (the
 * follow-up jobs this module enqueues). `run` names the fan-out the job belongs to.
 */
function readPayload(payload: unknown): { data: Record<string, unknown>; run: string } {
  const p =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const envelope = typeof p.event === 'string' && typeof p.data === 'object' && p.data !== null;
  const data = envelope ? (p.data as Record<string, unknown>) : p;
  const run =
    envelope && typeof p.eventId === 'string'
      ? p.eventId
      : typeof p.run === 'string'
        ? p.run
        : newId();
  return { data, run };
}

export const syncHandlers: HandlerMap = {
  /** listing.published, listing.changed, listing.closed, listing.removed. */
  'discovery.sync_listing': async (payload, { db, now }) => {
    const { listingId } = readPayload(payload).data;
    if (!isUuid(listingId)) throw new Error('discovery.sync_listing: listingId is required');
    await syncListing(db, listingId, now);
  },

  /**
   * hostpage.updated, location.updated, org.status_changed, subscription.changed, and its own
   * follow-ups. The dedupe key carries the fan-out's run (the event id), because outbox keys
   * are permanent: without it a later update of the same host would stop after 100 rows.
   */
  'discovery.sync_host': async (payload, { db, now }) => {
    const { data, run } = readPayload(payload);
    const { orgId, locationId, after } = data;
    if (!isUuid(orgId)) throw new Error('discovery.sync_host: orgId is required');
    const location = isUuid(locationId) ? locationId : undefined;
    const res = await syncHost(
      db,
      { orgId, locationId: location, after: isUuid(after) ? after : undefined },
      now,
    );
    if (res.next) {
      await enqueue(db, {
        topic: 'discovery.sync_host',
        payload: { orgId, locationId: location ?? null, after: res.next, run },
        dedupeKey: `sync_host:${orgId}:${location ?? '*'}:${res.next}:${run}`,
      });
    }
  },

  'discovery.drift_check': async (_payload, { db, now }) => {
    await driftCheck(db, now);
  },
};
