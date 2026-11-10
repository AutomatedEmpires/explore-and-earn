// Search over the projection: Seek, the Swipe deck and the Map list (SP3 spec 3.1, 8.1 and
// 8.4; plan Tasks 18, 19 and 21).
//
// - Sorts: relevant (rank with `q`, then the start bucket, then the publish date), newest, and
//   distance (on-site by distance from the origin, then Remote). Every sort ends in
//   `listing_id desc`, so the order is total and the keyset cursor never skips or repeats.
// - `asOf` in the cursor fixes "today" for every page of one search.
// - The count stops at 10,001 rows: above 10,000 the total reads 10,000 with `totalCapped`.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  stateByCode,
  todayIn,
  type DiscoveryQuery,
  type DiscoverySort,
  type DiscoverySource,
  type JobCardData,
} from '@/lib/discovery';
import { loadCards } from './cards';
import { cursorHash, decodeCursor, encodeCursor, staleCursor, type Cursor } from './cursor';
import { buildFilterSql, tsQuerySql, uuidArray, type FilterContext } from './filters';
import { overlayApplied, overlayHidden, type PlacementOutput } from './hooks';
import { place } from './placement';

export type SearchInput = {
  query: DiscoveryQuery;
  sort: DiscoverySort;
  surface: 'seek' | 'swipe' | 'map_list';
  cursor?: string;
  limit?: number;
  origin?: { lat: number; lng: number };
  tz: string;
  viewerUserId: string | null;
  viewerKey: string;
};

export type SearchResult = {
  items: JobCardData[];
  nextCursor: string | null;
  total: number;
  totalCapped: boolean;
};

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
/** Counts stop here; above it the total reads TOTAL_CAP with `totalCapped`. */
export const TOTAL_CAP = 10_000;
/** Listings that start within this many days of `asOf` share the first relevance bucket. */
const BUCKET_DAYS = 90;

const SOURCE: Record<SearchInput['surface'], DiscoverySource> = {
  seek: 'seek',
  swipe: 'swipe',
  map_list: 'map',
};

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** One key of a sort tuple: what is selected into the cursor and how it compares. */
type SortKey = {
  /** The value as selected (and stored in the cursor). */
  select: SQL;
  /** The expression compared with a cursor value. */
  cmp: SQL;
  dir: 'asc' | 'desc';
  kind: 'number' | 'flag' | 'timestamp';
};

const publishedKey: SortKey = {
  select: sql`to_char(dl.published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  cmp: sql`dl.published_at`,
  dir: 'desc',
  kind: 'timestamp',
};

function bucketKey(asOf: string): SortKey {
  const expr = sql`(case when dl.start_on is null
    or dl.start_on <= ${asOf}::date + ${BUCKET_DAYS}::int then 0 else 1 end)`;
  return { select: expr, cmp: expr, dir: 'asc', kind: 'flag' };
}

function rankKey(q: string): SortKey {
  const expr = sql`round(ts_rank_cd(dl.search, ${tsQuerySql(q)}, 32)::numeric, 6)::float8`;
  return { select: expr, cmp: expr, dir: 'desc', kind: 'number' };
}

function distanceKeys(origin: { lat: number; lng: number }): SortKey[] {
  const point = sql`ST_SetSRID(ST_MakePoint(${origin.lng}::float8, ${origin.lat}::float8), 4326)::geography`;
  const remote = sql`(case when dl.remote then 1 else 0 end)`;
  const distance = sql`(case when dl.remote then 0::float8
    else round(ST_Distance(dl.geog, ${point}))::float8 end)`;
  return [
    { select: remote, cmp: remote, dir: 'asc', kind: 'flag' },
    { select: distance, cmp: distance, dir: 'asc', kind: 'number' },
  ];
}

/** The distance origin: the given point, else a single state filter's centroid. */
function originOf(i: Pick<SearchInput, 'origin' | 'query'>): { lat: number; lng: number } | null {
  if (i.origin) return i.origin;
  const only = i.query.states?.length === 1 ? i.query.states[0] : undefined;
  return only ? (stateByCode(only)?.centroid ?? null) : null;
}

/** True when `q` has lexemes; stopwords or punctuation alone act as no `q`. */
async function hasLexemes(db: DbOrTx, q: string | undefined): Promise<boolean> {
  if (!q) return false;
  const [row] = await queryRows<{ n: number }>(db, sql`select numnode(${tsQuerySql(q)})::int as n`);
  return (row?.n ?? 0) > 0;
}

/** The sort tuple before `listing_id desc` (spec 8.4). Distance without an origin is relevant. */
function sortKeys(
  i: Pick<SearchInput, 'origin' | 'query' | 'sort'>,
  asOf: string,
  ranked: boolean,
): SortKey[] {
  if (i.sort === 'newest') return [publishedKey];
  const origin = i.sort === 'distance' ? originOf(i) : null;
  if (origin) return [...distanceKeys(origin), publishedKey];
  const relevant = [bucketKey(asOf), publishedKey];
  return ranked && i.query.q ? [rankKey(i.query.q), ...relevant] : relevant;
}

/** Sort values that fit the keys, or a 400: cursor values become SQL parameters. */
function checkValues(keys: SortKey[], values: Cursor['s']): void {
  const fits = (k: SortKey, v: unknown) =>
    k.kind === 'timestamp'
      ? typeof v === 'string' && ISO_TS.test(v)
      : k.kind === 'flag'
        ? v === 0 || v === 1
        : typeof v === 'number' && Number.isFinite(v);
  if (values.length !== keys.length || keys.some((k, n) => !fits(k, values[n]))) {
    throw staleCursor();
  }
}

const valueSql = (k: SortKey, v: string | number | null) =>
  k.kind === 'timestamp'
    ? sql`${v}::timestamptz`
    : k.kind === 'flag'
      ? sql`${v}::int`
      : sql`${v}::float8`;

/** Rows strictly after the cursor's position: an expanded OR over the sort tuple. */
function afterSql(keys: SortKey[], c: Pick<Cursor, 's' | 'id'>): SQL {
  const ors: SQL[] = [];
  const equal: SQL[] = [];
  keys.forEach((k, n) => {
    const v = c.s[n] ?? null;
    const op = k.dir === 'asc' ? sql`>` : sql`<`;
    ors.push(sql.join([...equal, sql`${k.cmp} ${op} ${valueSql(k, v)}`], sql` and `));
    equal.push(sql`${k.cmp} = ${valueSql(k, v)}`);
  });
  ors.push(sql.join([...equal, sql`dl.listing_id < ${c.id}::uuid`], sql` and `));
  return sql`(${sql.join(
    ors.map((o) => sql`(${o})`),
    sql` or `,
  )})`;
}

function orderSql(keys: SortKey[]): SQL {
  return sql.join(
    [
      ...keys.map((k) => sql`${k.cmp} ${k.dir === 'asc' ? sql`asc` : sql`desc`}`),
      sql`dl.listing_id desc`,
    ],
    sql`, `,
  );
}

type KeyedRow = { id: string; s: (string | number)[] };

/** Up to `limit` ids after `after`, in sort order, with their sort values. */
async function keyedPage(
  db: DbOrTx,
  where: SQL,
  keys: SortKey[],
  after: Pick<Cursor, 's' | 'id'> | null,
  limit: number,
): Promise<KeyedRow[]> {
  const selected = keys.map((k, n) => sql`${k.select} as ${sql.raw(`"s${n}"`)}`);
  const rows = await queryRows<Record<string, string | number>>(
    db,
    sql`select ${sql.join([sql`dl.listing_id::text as id`, ...selected], sql`, `)}
      from app.discovery_listings dl
      where ${where} ${after ? sql`and ${afterSql(keys, after)}` : sql``}
      order by ${orderSql(keys)}
      limit ${limit}::int`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    s: keys.map((_, n) => {
      const v = r[`s${n}`];
      return typeof v === 'number' ? v : String(v);
    }),
  }));
}

/** count(*) over the filtered set, stopping at TOTAL_CAP + 1. */
async function countMatches(db: DbOrTx, where: SQL): Promise<{ total: number; capped: boolean }> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from (
      select 1 from app.discovery_listings dl where ${where} limit ${TOTAL_CAP + 1}::int) c`,
  );
  const n = row?.n ?? 0;
  return n > TOTAL_CAP ? { total: TOTAL_CAP, capped: true } : { total: n, capped: false };
}

/** The viewer's overlay for this surface: blocked hosts, and on the deck what they applied to. */
async function overlayFor(
  db: DbOrTx,
  viewerUserId: string | null,
  surface: FilterContext['surface'],
): Promise<Pick<FilterContext, 'applied' | 'hidden'>> {
  if (!viewerUserId) return { applied: [], hidden: [] };
  const hidden = await overlayHidden(db, viewerUserId);
  const applied =
    surface === 'swipe' || surface === 'alerts'
      ? [...(await overlayApplied(db, viewerUserId, 'all'))]
      : [];
  return { applied, hidden };
}

export async function searchListings(db: DbOrTx, i: SearchInput): Promise<SearchResult> {
  const limit = Math.min(Math.max(Math.trunc(i.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const hash = cursorHash(i.query, i.sort);
  const cursor = i.cursor ? decodeCursor(i.cursor, hash) : null;
  const asOf = cursor?.asOf ?? todayIn(i.tz);

  const keys = sortKeys(i, asOf, await hasLexemes(db, i.query.q));
  if (cursor) checkValues(keys, cursor.s);

  const ctx: FilterContext = {
    today: asOf,
    viewerUserId: i.viewerUserId,
    surface: i.surface,
    ...(await overlayFor(db, i.viewerUserId, i.surface)),
  };
  const where = buildFilterSql(i.query, ctx);
  const rows = await keyedPage(db, where, keys, cursor, limit + 1);
  const organic = rows.slice(0, limit);
  const pageIndex = cursor ? cursor.pi + 1 : 0;

  // Seek and the deck go through the placement hook; the Map list never does (spec 8.13).
  let placed: PlacementOutput = {
    items: organic.map((r) => ({ listingId: r.id, boostId: null })),
    organicConsumed: organic.length,
    state: cursor?.ps ?? null,
  };
  if (i.surface !== 'map_list') {
    const surface = i.surface;
    placed = await place(db, {
      surface,
      pageIndex,
      pageSize: limit,
      organic: organic.map((r) => r.id),
      matchIds: (listingIds) =>
        filterListingIds(db, {
          listingIds,
          query: i.query,
          viewerUserId: i.viewerUserId,
          surface,
          today: asOf,
        }),
      viewerKey: i.viewerKey,
      state: cursor?.ps ?? null,
      now: new Date(),
    });
  }

  // The next page continues after the last organic item the page used.
  const last = organic[placed.organicConsumed - 1];
  const nextCursor =
    rows.length > placed.organicConsumed && last
      ? encodeCursor({
          v: 1,
          h: hash,
          s: last.s,
          id: last.id,
          asOf,
          ps: placed.state,
          pi: pageIndex,
        })
      : null;

  const seen = new Set<string>();
  const slots = placed.items.filter((x) => !seen.has(x.listingId) && seen.add(x.listingId));
  const boostIds = new Map(
    slots.flatMap((x) => (x.boostId ? [[x.listingId, x.boostId] as const] : [])),
  );
  const items = await loadCards(
    db,
    slots.map((x) => x.listingId),
    { viewerUserId: i.viewerUserId, tz: i.tz, source: SOURCE[i.surface], boostIds },
  );
  const { total, capped } = await countMatches(db, where);
  return { items, nextCursor, total, totalCapped: capped };
}

/**
 * The ids among `listingIds` that match the query on this surface for this viewer, in input
 * order: the placement hook's `matchIds`, SP6's `matchListingIds` and alert matching.
 */
export async function filterListingIds(
  db: DbOrTx,
  i: {
    listingIds: string[];
    query: DiscoveryQuery;
    viewerUserId: string | null;
    surface: FilterContext['surface'];
    today: string;
    firstActiveAfter?: Date;
    limit?: number;
  },
): Promise<string[]> {
  const ids = [...new Set(i.listingIds)];
  if (ids.length === 0) return [];
  const where = buildFilterSql(i.query, {
    today: i.today,
    viewerUserId: i.viewerUserId,
    surface: i.surface,
    ...(await overlayFor(db, i.viewerUserId, i.surface)),
  });
  const after = i.firstActiveAfter
    ? sql`and dl.first_active_at > ${i.firstActiveAfter.toISOString()}::timestamptz`
    : sql``;
  const rows = await queryRows<{ id: string }>(
    db,
    sql`select dl.listing_id::text as id from app.discovery_listings dl
      where dl.listing_id = any(${uuidArray(ids)}) and ${where} ${after}`,
  );
  const found = new Set(rows.map((r) => r.id));
  const kept = ids.filter((id) => found.has(id));
  return i.limit === undefined ? kept : kept.slice(0, Math.max(0, i.limit));
}

/** Active cards only, in input order. */
export async function getJobCards(
  _db: DbOrTx,
  _listingIds: string[],
  _opts?: { viewerUserId?: string | null; tz?: string },
): Promise<JobCardData[]> {
  throw new Error('not implemented: getJobCards');
}

/** The ids among `listingIds` that match `query` for this viewer (SP6 placement). */
export async function matchListingIds(
  _db: DbOrTx,
  _i: { listingIds: string[]; query: DiscoveryQuery; viewerUserId: string | null },
): Promise<string[]> {
  throw new Error('not implemented: matchListingIds');
}

/** New active listings since `since` (SP7's community digest). */
export async function countNewListings(
  _db: DbOrTx,
  _i: { since: Date },
): Promise<{ listings: number; hosts: number; withHousing: number }> {
  throw new Error('not implemented: countNewListings');
}
