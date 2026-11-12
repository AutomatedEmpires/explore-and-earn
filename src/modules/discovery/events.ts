// Listing events (views, saves, shares, applies), their daily rollup and counts (SP3 spec 8.12
// and section 6, plan Task 24).
//
// - Raw events carry no user id, ever. `viewer_hash` and `dedupe_key` are nulled after 24 hours
//   and the rows are deleted after 90 days (the nightly maintenance and SP8's retention rule).
// - `listing_event_daily` holds one count per listing, UTC day, type and source, recomputed from
//   the raw events, and is kept indefinitely.
// - Counts read the daily rows for past days and the raw events for today. Yesterday also comes
//   from the raw events until the nightly rollup has written it (04:15 UTC, which is the US
//   evening), so yesterday never reads as zero in the hours before the job runs.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx } from '@/lib/db';
import type { DiscoverySource, ListingEventType } from '@/lib/discovery';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import type { HandlerMap } from '@/modules/jobs';
import { hmacKey } from '@/server/viewer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
/** Raw events older than this are deleted (SP8 retention). */
export const RAW_EVENT_RETENTION_DAYS = 90;
/** Closed projection rows are deleted this long after `closed_at`. */
const CLOSED_ROW_RETENTION_DAYS = 365;
/** `viewer_hash` and `dedupe_key` are nulled after this long. */
const SCRUB_AFTER_MS = DAY_MS;
const DELETE_BATCH = 5_000;
/** A view or share by the same viewer counts once per 30-minute bucket. */
const DEDUPE_BUCKET_SEC = 1_800;

/** YYYY-MM-DD of `d` in UTC. */
const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
/** Midnight UTC of a YYYY-MM-DD day, as an ISO timestamp. */
const dayStart = (day: string): string => `${day}T00:00:00.000Z`;
const addDays = (day: string, n: number): string =>
  utcDay(new Date(Date.parse(dayStart(day)) + n * DAY_MS));

const uuidList = (ids: string[]): SQL =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
const textList = (values: readonly string[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

/** Records one event. Unknown listings are dropped silently, and so is a repeated dedupe key. */
export async function recordListingEvent(
  db: DbOrTx,
  e: {
    listingId: string;
    type: ListingEventType;
    source: DiscoverySource;
    at?: Date;
    viewerKey?: string | null;
    dedupeKey?: string;
  },
): Promise<void> {
  if (!UUID.test(e.listingId)) return;
  const at = e.at ?? new Date();
  const viewerHash = e.viewerKey ? hmacKey(e.viewerKey) : null;
  // The org comes from the projection row; with no row the select is empty and nothing is
  // written.
  await db.execute(sql`
    insert into app.listing_events
      (id, listing_id, org_id, type, source, viewer_hash, dedupe_key, occurred_at)
    select ${newId()}::uuid, dl.listing_id, dl.org_id, ${e.type}, ${e.source}, ${viewerHash},
      ${e.dedupeKey ?? null}, ${at.toISOString()}::timestamptz
    from app.discovery_listings dl
    where dl.listing_id = ${e.listingId}::uuid
    on conflict (dedupe_key) do nothing
  `);
}

/**
 * Event counts for an org's listings over [from, to), both taken as UTC days (SP5 analytics,
 * SP6 boost reporting). `source` is set on each row only when `sources` is given (Plan
 * decision 6); otherwise each row sums every source. Week buckets start on the ISO Monday.
 */
export async function getListingEventCounts(
  db: DbOrTx,
  i: {
    orgId: string;
    listingIds?: string[];
    from: Date;
    to: Date;
    types: ListingEventType[];
    sources?: DiscoverySource[];
    bucket: 'day' | 'week' | 'none';
  },
): Promise<
  {
    listingId: string;
    bucketStart: string | null;
    type: ListingEventType;
    source: DiscoverySource | null;
    count: number;
  }[]
> {
  const listingIds = i.listingIds?.filter((id) => UUID.test(id));
  if (!UUID.test(i.orgId) || i.types.length === 0) return [];
  if (listingIds?.length === 0 || i.sources?.length === 0) return [];
  const fromDay = utcDay(i.from);
  const toDay = utcDay(i.to);
  if (fromDay >= toDay) return [];

  const today = utcDay(new Date());
  const yesterday = addDays(today, -1);
  const rawFromDay = fromDay > yesterday ? fromDay : yesterday;
  const bySource = i.sources !== undefined;

  const where = (alias: 'd' | 'e'): SQL => {
    const t = sql.raw(alias);
    const parts = [sql`${t}.org_id = ${i.orgId}::uuid`, sql`${t}.type in (${textList(i.types)})`];
    if (listingIds) parts.push(sql`${t}.listing_id in (${uuidList(listingIds)})`);
    if (i.sources) parts.push(sql`${t}.source in (${textList(i.sources)})`);
    return sql.join(parts, sql` and `);
  };

  const bucket =
    i.bucket === 'day'
      ? sql`c.day::text`
      : i.bucket === 'week'
        ? sql`date_trunc('week', c.day::timestamp)::date::text`
        : sql`null::text`;

  const rows = await queryRows<{
    listingId: string;
    bucketStart: string | null;
    type: ListingEventType;
    source: DiscoverySource | null;
    count: number;
  }>(
    db,
    sql`
      with counted as (
        select d.listing_id, d.day, d.type, d.source, d.count
        from app.listing_event_daily d
        where ${where('d')} and d.day >= ${fromDay}::date and d.day < ${toDay}::date
          and d.day < ${today}::date
        union all
        select e.listing_id, (e.occurred_at at time zone 'UTC')::date, e.type, e.source,
          count(*)::int
        from app.listing_events e
        where ${where('e')}
          and e.occurred_at >= ${dayStart(rawFromDay)}::timestamptz
          and e.occurred_at < ${dayStart(toDay)}::timestamptz
          and (e.occurred_at >= ${dayStart(today)}::timestamptz
            or not exists (select 1 from app.listing_event_daily x
              where x.listing_id = e.listing_id and x.day = ${yesterday}::date))
        group by 1, 2, 3, 4
      )
      select c.listing_id::text as "listingId", ${bucket} as "bucketStart", c.type,
        ${bySource ? sql`c.source` : sql`null::text`} as source, sum(c.count)::int as count
      from counted c
      group by 1, 2, 3, 4
      order by 1, 2 nulls first, 3, 4 nulls first
    `,
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

/** All-time views and saves per listing, for SP2's listing library (internal). */
export async function listingStats(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, { views: number; saves: number }>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  const out = new Map(wanted.map((id) => [id, { views: 0, saves: 0 }]));
  if (wanted.length === 0) return out;
  const today = utcDay(new Date());
  const yesterday = addDays(today, -1);
  const rows = await queryRows<{ id: string; views: number; saves: number }>(
    db,
    sql`
      with counted as (
        select d.listing_id, d.type, d.count
        from app.listing_event_daily d
        where d.listing_id in (${uuidList(wanted)}) and d.type in ('view', 'save')
          and d.day < ${today}::date
        union all
        select e.listing_id, e.type, 1
        from app.listing_events e
        where e.listing_id in (${uuidList(wanted)}) and e.type in ('view', 'save')
          and e.occurred_at >= ${dayStart(yesterday)}::timestamptz
          and (e.occurred_at >= ${dayStart(today)}::timestamptz
            or not exists (select 1 from app.listing_event_daily x
              where x.listing_id = e.listing_id and x.day = ${yesterday}::date))
      )
      select listing_id::text as id,
        coalesce(sum(count) filter (where type = 'view'), 0)::int as views,
        coalesce(sum(count) filter (where type = 'save'), 0)::int as saves
      from counted
      group by listing_id
    `,
  );
  for (const r of rows) out.set(r.id, { views: Number(r.views), saves: Number(r.saves) });
  return out;
}

/** `<type>:<hmac(viewerKey)>:<listingId>:<30-minute bucket>`. */
export function dedupeKeyFor(
  type: 'view' | 'share',
  viewerKey: string,
  listingId: string,
  at: Date,
): string {
  const bucket = Math.floor(Math.floor(at.getTime() / 1000) / DEDUPE_BUCKET_SEC);
  return `${type}:${hmacKey(viewerKey)}:${listingId}:${bucket}`;
}

/**
 * Deletes at most `limit` raw events with `occurred_at < cutoff` and returns how many went.
 * Shared by the nightly maintenance and SP8's retention rule (internal).
 */
export async function deleteRawEventsBefore(
  db: DbOrTx,
  cutoff: Date,
  limit: number,
): Promise<number> {
  if (!Number.isInteger(limit) || limit <= 0) return 0;
  const rows = await queryRows<{ n: number }>(
    db,
    sql`
      with gone as (
        delete from app.listing_events
        where id in (
          select id from app.listing_events
          where occurred_at < ${cutoff.toISOString()}::timestamptz
          limit ${limit}
        )
        returning 1
      )
      select count(*)::int as n from gone
    `,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Recomputes the daily rows of `day` from the raw events, and rolls up every earlier
 * listing-day that still has raw events but no daily rows (a run the scheduler skipped, or one
 * that failed), so nothing is lost when the raw events are deleted. Returns the rows written.
 */
async function rollUp(db: Db, day: string): Promise<number> {
  return withTx(db, async (tx) => {
    // Two overlapping runs would otherwise both insert the day's rows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('discovery.rollup'))::text`);
    await tx.execute(sql`delete from app.listing_event_daily where day = ${day}::date`);
    const rows = await queryRows<{ n: number }>(
      tx,
      sql`
        with recomputed as (
          insert into app.listing_event_daily (listing_id, org_id, day, type, source, count)
          select listing_id, org_id, ${day}::date, type, source, count(*)::int
          from app.listing_events
          where occurred_at >= ${dayStart(day)}::timestamptz
            and occurred_at < ${dayStart(addDays(day, 1))}::timestamptz
          group by listing_id, org_id, type, source
          returning 1
        )
        select count(*)::int as n from recomputed
      `,
    );
    // Earlier days are filled in only where a listing has no row for the day, so a day that was
    // rolled up is never counted twice.
    const missed = await queryRows<{ n: number }>(
      tx,
      sql`
        with backfilled as (
          insert into app.listing_event_daily (listing_id, org_id, day, type, source, count)
          select e.listing_id, e.org_id, (e.occurred_at at time zone 'UTC')::date, e.type,
            e.source, count(*)::int
          from app.listing_events e
          where e.occurred_at < ${dayStart(day)}::timestamptz
            and not exists (select 1 from app.listing_event_daily d
              where d.listing_id = e.listing_id
                and d.day = (e.occurred_at at time zone 'UTC')::date)
          group by 1, 2, 3, 4, 5
          returning 1
        )
        select count(*)::int as n from backfilled
      `,
    );
    return Number(rows[0]?.n ?? 0) + Number(missed[0]?.n ?? 0);
  });
}

/**
 * The nightly `discovery.maintenance` job (spec section 6): recompute yesterday's daily rows
 * (and roll up any earlier day a skipped run left behind), null the viewer hash and dedupe key
 * after 24 hours, delete raw events after 90 days, and delete closed projection rows 365 days
 * after `closed_at` with their dispositions and alert matches. Each step is idempotent, so a
 * retried run changes nothing more.
 */
export async function runMaintenance(
  db: Db,
  now: Date,
): Promise<{ rolledUp: number; scrubbed: number; deletedEvents: number; deletedClosed: number }> {
  const rolledUp = await rollUp(db, addDays(utcDay(now), -1));

  const scrubRows = await queryRows<{ n: number }>(
    db,
    sql`
      with scrubbed as (
        update app.listing_events set viewer_hash = null, dedupe_key = null
        where occurred_at < ${new Date(now.getTime() - SCRUB_AFTER_MS).toISOString()}::timestamptz
          and (viewer_hash is not null or dedupe_key is not null)
        returning 1
      )
      select count(*)::int as n from scrubbed
    `,
  );
  const scrubbed = Number(scrubRows[0]?.n ?? 0);

  const eventCutoff = new Date(now.getTime() - RAW_EVENT_RETENTION_DAYS * DAY_MS);
  let deletedEvents = 0;
  for (;;) {
    const n = await deleteRawEventsBefore(db, eventCutoff, DELETE_BATCH);
    deletedEvents += n;
    if (n < DELETE_BATCH) break;
  }

  // The row goes first and its dispositions and matches follow the ids it returned, so a listing
  // that SP2 reactivates meanwhile keeps its row (the delete rechecks the predicate) and its
  // seekers' saves.
  const closedCutoff = new Date(now.getTime() - CLOSED_ROW_RETENTION_DAYS * DAY_MS);
  const closedRows = await queryRows<{ n: number }>(
    db,
    sql`
      with gone as (
        delete from app.discovery_listings
        where not is_active and closed_at <= ${closedCutoff.toISOString()}::timestamptz
        returning listing_id
      ),
      matches as (
        delete from app.saved_search_matches
        where listing_id in (select listing_id from gone)
      ),
      dispositions as (
        delete from app.listing_dispositions
        where listing_id in (select listing_id from gone)
      )
      select count(*)::int as n from gone
    `,
  );
  const deletedClosed = Number(closedRows[0]?.n ?? 0);

  return { rolledUp, scrubbed, deletedEvents, deletedClosed };
}

export const eventHandlers: HandlerMap = {
  'discovery.maintenance': async (_payload, { db, now }) => {
    const result = await runMaintenance(db, now);
    logger.info('discovery.maintenance', result);
  },
};
