// Projection sync from SP2 events, the host fan-out and the nightly drift check (SP3 spec
// section 6, plan Tasks 8 and 9).
//
// syncListing always re-reads SP2 under a per-listing advisory lock, whatever event woke it,
// so concurrent syncs of one listing end in the state SP2 holds last:
// - active: the listing, its host and its location are read and the row is upserted. A missing
//   read throws from syncListing, so that single job retries. A batch logs the listing,
//   raises one alert and continues, so one failure cannot stall the fan-out. A host fan-out
//   also queues each failed row as its own sync_listing job: the nightly check ignores a
//   row whose listing revision still matches, so a host or location change would otherwise
//   stay stale.
// - closed: the row stays, inactive, with closed_at set.
// - anything else, or no listing at all: the row goes, and in the same transaction the
//   listing's dispositions and alert matches (spec failure mode 1).
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
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
import { buildProjectionRow, hostSinceOf, upsertProjectionRow } from './projection';
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

/**
 * The host columns a closed row still shows (saved jobs list closed cards): the host's current
 * name, slug, logo and subscriber date, so a lapsed subscription loses its badge there too. A
 * host that is no longer public keeps its name and loses the badge; closing never waits on it.
 */
async function closedHostColumns(tx: Tx, orgId: string): Promise<SQL> {
  const host = (await hostIdentities(tx, [orgId])).get(orgId);
  if (!host) return sql`host_since = null`;
  const logo = host.logoMediaId
    ? ((await publicMediaUrls(tx, [host.logoMediaId])).get(host.logoMediaId)?.[320] ?? null)
    : null;
  return sql`host_name = ${host.name}, host_slug = ${host.slug}, host_logo_url = ${logo},
    host_since = ${hostSinceOf(host)}::date`;
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
        set is_active = false, closed_at = coalesce(closed_at, ${now.toISOString()}::timestamptz),
          ${await closedHostColumns(tx, summary.orgId)}
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

/** One item of a batch. A failure is logged and skipped so the rest of the batch still runs. */
async function syncItem(
  db: Db,
  listingId: string,
  now: Date,
  lookups: Lookups,
): Promise<SyncResult | null> {
  try {
    return await syncWith(db, listingId, now, lookups);
  } catch (err) {
    logger.error('discovery.sync_item_failed', { listingId, err });
    return null;
  }
}

/** One alert for a batch, not one per listing. */
async function alertSyncFailures(db: Db, failed: number): Promise<void> {
  if (failed === 0) return;
  await raiseAlert(db, {
    severity: 'warning',
    kind: 'discovery.sync_failed',
    message:
      failed === 1
        ? 'A listing failed to sync and was skipped'
        : 'Some listings failed to sync and were skipped',
    data: { failed },
  });
}

/**
 * Re-syncs up to 100 projection rows of the org (or of one of its locations), in listing_id
 * order after `after`. `next` is the last id of the page when more rows follow. A failed row
 * is queued as `discovery.sync_listing` (keyed by `run`) so the outbox retries it; the page
 * still advances.
 */
export async function syncHost(
  db: Db,
  i: { orgId: string; locationId?: string; after?: string; run?: string },
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
  const run = i.run ?? newId();
  let synced = 0;
  let failed = 0;
  for (const r of page) {
    if ((await syncItem(db, r.id, now, lookups)) === null) {
      failed += 1;
      // Host, location and subscription changes do not move the listing revision, so the
      // nightly check will not come back for this row. The single-listing job still throws.
      await enqueue(db, {
        topic: 'discovery.sync_listing',
        payload: { listingId: r.id },
        dedupeKey: `sync_listing_retry:${r.id}:${run}`,
      });
    } else synced += 1;
  }
  await alertSyncFailures(db, failed);
  return {
    synced,
    next: rows.length > HOST_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
  };
}

type Counts = { upserted: number; removed: number };

/**
 * The two drift passes: every SP2 listing whose row is missing, inactive or on another
 * revision; then every row, active or closed, that SP2 no longer reports in its state (an
 * active row whose listing closed, or any row whose listing was removed or is gone).
 */
async function reconcile(db: Db, now: Date): Promise<{ counts: Counts; failed: number }> {
  const lookups = await loadLookups(db);
  const counts: Counts = { upserted: 0, removed: 0 };
  let failed = 0;
  const tally = (r: SyncResult | null) => {
    if (r === null) {
      failed += 1;
      return;
    }
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
      tally(await syncItem(db, l.listingId, now, lookups));
    }
    if (!page.next) break;
    after = page.next;
  }

  let cursor: string | null = null;
  for (;;) {
    const rows: { id: string; active: boolean }[] = await queryRows<{
      id: string;
      active: boolean;
    }>(
      db,
      sql`select listing_id::text as id, is_active as active from app.discovery_listings
        ${cursor ? sql`where listing_id > ${cursor}::uuid` : sql``}
        order by listing_id limit ${DRIFT_PAGE_SIZE}`,
    );
    if (rows.length === 0) break;
    const summaries = await getListingSummaries(
      db,
      rows.map((r) => r.id),
    );
    for (const r of rows) {
      const state = summaries.get(r.id)?.state;
      // Active listings were checked in the first pass; a closed row of a closed listing is right.
      if (state === 'active' || (state === 'closed' && !r.active)) continue;
      tally(await syncItem(db, r.id, now, lookups));
    }
    if (rows.length < DRIFT_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]?.id ?? null;
  }
  return { counts, failed };
}

/** The nightly repair (spec section 6). Any repair is audited and raises a warning alert. */
export async function driftCheck(
  db: Db,
  now: Date,
): Promise<{ upserted: number; removed: number; repaired: number }> {
  const { counts, failed } = await reconcile(db, now);
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
  await alertSyncFailures(db, failed);
  return result;
}

/** The drift check without paging limits (SP8 restore runbook); always audited. */
export async function rebuildSearchProjection(
  db: Db,
): Promise<{ upserted: number; removed: number }> {
  const { counts, failed } = await reconcile(db, new Date());
  await record(db, {
    actorType: 'system',
    actorId: null,
    action: 'discovery.projection_rebuilt',
    subjectType: 'discovery_projection',
    subjectId: null,
    data: counts,
  });
  await alertSyncFailures(db, failed);
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
      { orgId, locationId: location, after: isUuid(after) ? after : undefined, run },
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
