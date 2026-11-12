// The one filter builder every surface shares (SP3 spec 8.1 and 8.3, plan Task 18): Seek, the
// Swipe deck, the Map pins and list, the location preview, the state counts and alert matching.
// The WHERE clause reads the projection under the alias `dl`:
//
//   select ... from app.discovery_listings dl where ${buildFilterSql(q, ctx)}
//
// It always includes `dl.is_active`, so a closed or removed listing is gone from every surface
// that uses it (spec failure mode 1).
import { sql, type SQL } from 'drizzle-orm';
import { addDays, seasonWindow, withinMonthsEnd, type DiscoveryQuery } from '@/lib/discovery';

export type FilterContext = {
  /** YYYY-MM-DD in the viewer's time zone. */
  today: string;
  /** A seeker; hosts, operators and guests get no exclusions (spec 8.1). */
  viewerUserId: string | null;
  surface: 'seek' | 'swipe' | 'map_list' | 'alerts';
  /** Listings the seeker applied to (the SP4 overlay). */
  applied: string[];
  /** Orgs the seeker blocked (the SP4 overlay). */
  hidden: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A single word of 3 or more letters or digits also matches as a prefix. */
const SINGLE_WORD = /^[\p{L}\p{N}]{3,}$/u;

export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/** Only well-formed ids; anything else could never match a uuid column. */
export function uuidArray(values: readonly string[]): SQL {
  const ids = values.filter((v) => UUID.test(v));
  if (ids.length === 0) return sql`'{}'::uuid[]`;
  return sql`array[${sql.join(
    ids.map((v) => sql`${v}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

const envelope = (w: number, s: number, e: number, n: number) =>
  sql`dl.geog::geometry && ST_MakeEnvelope(${w}::float8, ${s}::float8, ${e}::float8, ${n}::float8, 4326)`;

/**
 * Listings whose point is inside the box. The box is a plain longitude and latitude range, as a
 * map viewport is, so the test is planar: a geography envelope would take its edges as great
 * circles, so it would miss points along the bottom of a wide view and fold a box wider than
 * 180° the short way round. When `west > east` the box crosses the antimeridian and is
 * matched as its two halves (Review Focus 5).
 */
export function bboxSql(b: readonly [number, number, number, number]): SQL {
  const [w, s, e, n] = b;
  if (w > e) return sql`(${envelope(w, s, 180, n)} or ${envelope(-180, s, e, n)})`;
  return envelope(w, s, e, n);
}

/** websearch_to_tsquery, OR-ed with `word:*` for a single word of 3 or more letters or digits. */
export function tsQuerySql(q: string): SQL {
  const web = sql`websearch_to_tsquery('english', ${q})`;
  if (!SINGLE_WORD.test(q)) return web;
  return sql`(${web} || to_tsquery('english', ${q} || ':*'))`;
}

function startSql(start: NonNullable<DiscoveryQuery['start']>, today: string): SQL {
  if ('withinMonths' in start) {
    const end = withinMonthsEnd(today, start.withinMonths);
    return sql`(dl.start_on is null or dl.start_on <= ${end}::date)`;
  }
  if (start.season === 'year_round') {
    return sql`(dl.schedule_kind = 'ongoing'
      or (dl.season = 'year_round' and dl.season_year = ${start.year}::int))`;
  }
  const window = seasonWindow(start.season, start.year);
  const inWindow = window
    ? sql` or dl.start_on between ${window.from}::date and ${window.to}::date`
    : sql``;
  return sql`((dl.season = ${start.season} and dl.season_year = ${start.year}::int)${inWindow})`;
}

function paySql(pay: NonNullable<DiscoveryQuery['pay']>): SQL {
  switch (pay.unit) {
    case 'hour':
      return sql`dl.pay_hourly_min_cents >= ${pay.minCents}::int`;
    case 'day':
      return sql`dl.pay_hourly_min_cents::bigint * 8 >= ${pay.minCents}::bigint`;
    case 'year':
      return sql`dl.pay_yearly_min_cents >= ${pay.minCents}::int`;
  }
}

/** The filters of `q` alone, without the exclusions. */
function querySql(q: DiscoveryQuery, today: string): SQL[] {
  const parts: SQL[] = [];
  if (q.q) {
    const tsq = tsQuerySql(q.q);
    // A query of stopwords or punctuation only has no lexemes and acts as no `q`.
    parts.push(sql`(numnode(${tsq}) = 0 or dl.search @@ ${tsq})`);
  }
  if (q.categories?.length) parts.push(sql`dl.categories && ${textArray(q.categories)}`);
  if (q.genres?.length) parts.push(sql`dl.genre = any(${textArray(q.genres)})`);
  if (q.states?.length) {
    const states = textArray(q.states);
    parts.push(sql`((not dl.remote and dl.state = any(${states}))
      or (dl.remote and dl.remote_states && (${states} || '{US}'::text[])))`);
  }
  if (q.destination) parts.push(sql`dl.destination_slug = ${q.destination}`);
  if (q.orgId !== undefined) {
    parts.push(UUID.test(q.orgId) ? sql`dl.org_id = ${q.orgId}::uuid` : sql`false`);
  }
  if (q.start) parts.push(startSql(q.start, today));
  if (q.startingSoon) {
    parts.push(sql`dl.start_on between ${today}::date and ${addDays(today, 30)}::date`);
  }
  if (q.housing === 'provided') parts.push(sql`dl.housing_provided`);
  if (q.housing === 'free') parts.push(sql`dl.housing_free`);
  if (q.meals === 'provided') parts.push(sql`dl.meals_provided`);
  if (q.meals === 'free') parts.push(sql`dl.meals_free`);
  if (q.sponsorsVisas) parts.push(sql`dl.sponsors_visas`);
  if (q.pay) parts.push(paySql(q.pay));
  if (q.bbox) parts.push(bboxSql(q.bbox));
  if (q.locationId !== undefined) {
    parts.push(UUID.test(q.locationId) ? sql`dl.location_id = ${q.locationId}::uuid` : sql`false`);
  }
  return parts;
}

/** The viewer's exclusions on this surface (spec 8.1). */
function exclusionSql(ctx: FilterContext): SQL[] {
  const parts: SQL[] = [];
  if (ctx.viewerUserId && UUID.test(ctx.viewerUserId)) {
    // Every surface drops skipped listings; the deck also drops saved ones.
    const states =
      ctx.surface === 'swipe' ? textArray(['skipped', 'saved']) : textArray(['skipped']);
    parts.push(sql`not exists (select 1 from app.listing_dispositions ld
      where ld.user_id = ${ctx.viewerUserId}::uuid and ld.listing_id = dl.listing_id
        and ld.state = any(${states}))`);
  }
  if (ctx.hidden.length > 0) parts.push(sql`dl.org_id <> all(${uuidArray(ctx.hidden)})`);
  if ((ctx.surface === 'swipe' || ctx.surface === 'alerts') && ctx.applied.length > 0) {
    parts.push(sql`dl.listing_id <> all(${uuidArray(ctx.applied)})`);
  }
  return parts;
}

/** The WHERE clause over `dl`: active rows, every filter of `q` and the viewer's exclusions. */
export function buildFilterSql(q: DiscoveryQuery, ctx: FilterContext): SQL {
  return sql.join([sql`dl.is_active`, ...querySql(q, ctx.today), ...exclusionSql(ctx)], sql` and `);
}
