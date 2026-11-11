// Uncapped reads of the search projection for landing (SP3 W8). Search pages stop at 50 and
// totals at 10,000; sitemaps have to walk every active listing, so this feed does not.
// Landing calls these instead of naming the projection table.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { seasonWindow, type DiscoveryQuery, type Season } from '@/lib/discovery';
import { GENRES } from '@/lib/taxonomy';
import { buildFilterSql, type FilterContext } from './filters';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GUEST: Omit<FilterContext, 'today'> = {
  viewerUserId: null,
  surface: 'seek',
  applied: [],
  hidden: [],
};

export type ActiveListing = {
  listingId: string;
  slug: string;
  indexedAt: Date;
};

export type LandingCoverage = {
  onSiteStates: { code: string; indexedAt: Date }[];
  remoteStates: { code: string; indexedAt: Date }[];
  /** Latest active listing that is remote across the whole US, if there is one. */
  remoteAnywhereAt: Date | null;
  categories: { category: string; indexedAt: Date }[];
  /** On-site state, or a remote listing's named state (not the US-wide marker). */
  categoryStates: { category: string; code: string; indexedAt: Date }[];
  remoteCategoryAnywhere: { category: string; indexedAt: Date }[];
  genres: { slug: string; category: string; indexedAt: Date }[];
  seasons: { season: Season; indexedAt: Date | null }[];
  destinations: { slug: string; indexedAt: Date }[];
  internationalAt: Date | null;
};

function asDate(value: Date | number | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.round(ms));
}

function seasonMatchSql(season: Season, year: number): SQL {
  if (season === 'year_round') {
    return sql`(dl.schedule_kind = 'ongoing'
      or (dl.season = 'year_round' and dl.season_year = ${year}::int))`;
  }
  const window = seasonWindow(season, year);
  const inWindow = window
    ? sql` or dl.start_on between ${window.from}::date and ${window.to}::date`
    : sql``;
  return sql`((dl.season = ${season} and dl.season_year = ${year}::int)${inWindow})`;
}

/** Active listings in listing_id order. `next` is the last id on this page, or null. */
export async function listActiveListings(
  db: DbOrTx,
  input: { after?: string; limit: number },
): Promise<{ items: ActiveListing[]; next: string | null }> {
  const limit = Math.floor(input.limit);
  if (!Number.isInteger(limit) || limit < 1) return { items: [], next: null };
  if (input.after !== undefined && !UUID.test(input.after)) return { items: [], next: null };
  const rows = await queryRows<{ id: string; slug: string; indexed_at: number | string }>(
    db,
    sql`select listing_id::text as id, slug,
        (extract(epoch from indexed_at) * 1000)::float8 as indexed_at
      from app.discovery_listings
      where is_active
        ${input.after ? sql`and listing_id > ${input.after}::uuid` : sql``}
      order by listing_id
      limit ${limit + 1}::int`,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      listingId: row.id,
      slug: row.slug,
      indexedAt: asDate(row.indexed_at) ?? new Date(NaN),
    })),
    next: rows.length > limit && last ? last.id : null,
  };
}

type StampRow = { indexed_at: number | string | null };

function stamps<T extends StampRow>(rows: T[]): (Omit<T, 'indexed_at'> & { indexedAt: Date })[] {
  return rows.flatMap((row) => {
    const indexedAt = asDate(row.indexed_at);
    if (!indexedAt) return [];
    const { indexed_at: _ignored, ...rest } = row;
    return [{ ...rest, indexedAt }];
  });
}

/** One pass of grouped maxima for the landing sitemap. Closed listings are absent. */
export async function landingCoverage(
  db: DbOrTx,
  input: { seasons: { season: Season; year: number }[] },
): Promise<LandingCoverage> {
  const genreValues = sql.join(
    GENRES.map((genre) => sql`(${genre.code.replaceAll('_', '-')}, ${genre.category})`),
    sql`, `,
  );
  const [
    onSiteStates,
    remoteStates,
    remoteAnywhere,
    categories,
    categoryStates,
    remoteCategoryAnywhere,
    genres,
    seasons,
    destinations,
    international,
  ] = await Promise.all([
    queryRows<{ code: string; indexed_at: number | string }>(
      db,
      sql`select btrim(dl.state::text) as code,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        where dl.is_active and not dl.remote
        group by 1`,
    ),
    queryRows<{ code: string; indexed_at: number | string }>(
      db,
      sql`select btrim(u.code) as code,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        cross join lateral unnest(dl.remote_states) as u(code)
        where dl.is_active and dl.remote and u.code <> 'US'
        group by 1`,
    ),
    queryRows<StampRow>(
      db,
      sql`select (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        where dl.is_active and dl.remote and 'US' = any(dl.remote_states)`,
    ),
    queryRows<{ category: string; indexed_at: number | string }>(
      db,
      sql`select c as category,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        cross join lateral unnest(dl.categories) as c
        where dl.is_active
        group by 1`,
    ),
    queryRows<{ category: string; code: string; indexed_at: number | string }>(
      db,
      sql`select c as category, btrim(dl.state::text) as code,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        cross join lateral unnest(dl.categories) as c
        where dl.is_active and not dl.remote
        group by 1, 2
        union all
        select c as category, btrim(u.code) as code,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        cross join lateral unnest(dl.categories) as c
        cross join lateral unnest(dl.remote_states) as u(code)
        where dl.is_active and dl.remote and u.code <> 'US'
        group by 1, 2`,
    ),
    queryRows<{ category: string; indexed_at: number | string }>(
      db,
      sql`select c as category,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        cross join lateral unnest(dl.categories) as c
        where dl.is_active and dl.remote and 'US' = any(dl.remote_states)
        group by 1`,
    ),
    queryRows<{ slug: string; category: string; indexed_at: number | string }>(
      db,
      sql`select g.slug, g.category,
          (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings dl
        join (values ${genreValues}) as g(slug, category)
          on dl.genre = g.slug::text and g.category::text = any(dl.categories)
        where dl.is_active
        group by g.slug, g.category`,
    ),
    Promise.all(
      input.seasons.map(async (item) => {
        const [row] = await queryRows<StampRow>(
          db,
          sql`select (extract(epoch from max(dl.indexed_at) filter (
              where ${seasonMatchSql(item.season, item.year)}
            )) * 1000)::float8 as indexed_at
            from app.discovery_listings dl
            where dl.is_active`,
        );
        return { season: item.season, indexedAt: asDate(row?.indexed_at) };
      }),
    ),
    queryRows<{ slug: string; indexed_at: number | string }>(
      db,
      sql`select destination_slug as slug,
          (extract(epoch from max(indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings
        where is_active and destination_slug is not null
        group by 1`,
    ),
    queryRows<StampRow>(
      db,
      sql`select (extract(epoch from max(indexed_at)) * 1000)::float8 as indexed_at
        from app.discovery_listings
        where is_active and sponsors_visas`,
    ),
  ]);

  return {
    onSiteStates: stamps(onSiteStates),
    remoteStates: stamps(remoteStates),
    remoteAnywhereAt: asDate(remoteAnywhere[0]?.indexed_at),
    categories: stamps(categories),
    categoryStates: stamps(categoryStates),
    remoteCategoryAnywhere: stamps(remoteCategoryAnywhere),
    genres: stamps(genres),
    seasons,
    destinations: stamps(destinations),
    internationalAt: asDate(international[0]?.indexed_at),
  };
}

/** True when an active listing matches a landing query. Guests are not excluded. */
export async function hasActiveListing(
  db: DbOrTx,
  query: DiscoveryQuery,
  today: string,
): Promise<boolean> {
  const where = buildFilterSql(query, { ...GUEST, today });
  const [row] = await queryRows<{ ok: boolean | string }>(
    db,
    sql`select exists(
      select 1 from app.discovery_listings dl
      where ${where}
    ) as ok`,
  );
  return row?.ok === true || row?.ok === 't' || row?.ok === 'true';
}
