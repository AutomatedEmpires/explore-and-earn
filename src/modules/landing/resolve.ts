// Landing page resolution: a path to a pre-filtered query with its copy (SP3 spec 3.2 and
// 8.11, plan Task 40). A page is indexable when at least one active listing matches. The
// landing sitemap asks listLandingPaths for those pages, counted in grouped queries rather
// than one search per page.
import { eq, sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import {
  seasonLabel,
  seasonWindow,
  stateByCode,
  stateBySlug,
  todayIn,
  US_STATES,
  type DiscoveryQuery,
  type Season,
} from '@/lib/discovery';
import { CATEGORIES, GENRES, type Category } from '@/lib/taxonomy';
import { listDestinations } from '@/modules/locations';
import { getMediaUrl, getStorage, type MediaViewer } from '@/modules/media';
import { landingPages } from './schema';

export type LandingKind =
  | 'state'
  | 'category'
  | 'category_state'
  | 'category_genre'
  | 'season'
  | 'destination'
  | 'international';

export type LandingPage = {
  key: string;
  kind: LandingKind;
  path: string;
  title: string;
  intro: string;
  hero: { url: string; alt: string } | null;
  seoTitle: string;
  seoDescription: string;
  query: DiscoveryQuery;
  /** At least one active listing matches; otherwise noindex and out of the sitemap. */
  indexable: boolean;
  breadcrumbs: { name: string; path: string }[];
};

/** The only pages /international links to: we can't give visa advice (spec 8.11). */
export const OFFICIAL_VISA_LINKS: readonly { label: string; url: string }[] = [
  {
    label: 'U.S. visas (U.S. Department of State)',
    url: 'https://travel.state.gov/content/travel/en/us-visas.html',
  },
  { label: 'J-1 Exchange Visitor Program', url: 'https://j1visa.state.gov/' },
  {
    label: 'Foreign labor certification (U.S. Department of Labor)',
    url: 'https://www.dol.gov/agencies/eta/foreign-labor',
  },
  { label: 'U.S. Citizenship and Immigration Services', url: 'https://www.uscis.gov/' },
];

/**
 * The same all-zero viewer as the projection's public media reads (Task 8): it owns nothing,
 * so only an approved public hero comes back.
 */
const SYSTEM_VIEWER: MediaViewer = {
  userId: '00000000-0000-0000-0000-000000000000',
  orgIds: [],
  isOperator: false,
};

const CATEGORY_LABELS: Record<Category, string> = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
};

const CATEGORY_SLUGS = new Set<string>(CATEGORIES);
const LANDING_STATES = US_STATES.filter((state) => state.landing);
const GENRE_BY_SLUG = new Map(GENRES.map((genre) => [genre.code.replaceAll('_', '-'), genre]));

const SEASON_FROM_SLUG: Record<string, Season> = {
  spring: 'spring',
  summer: 'summer',
  fall: 'fall',
  winter: 'winter',
  'year-round': 'year_round',
};

const SEASON_SLUG: Record<Season, string> = {
  spring: 'spring',
  summer: 'summer',
  fall: 'fall',
  winter: 'winter',
  year_round: 'year-round',
};

/** Visa basics in plain words. Counsel reviews this before launch (spec 8.11). */
const INTERNATIONAL_INTRO =
  "A visa is the US government's permission to work here. Some employers sponsor one, and many do not. Which visa you can get depends on the job and your country. We can't give visa advice. These official pages explain your options.";

type Target = {
  key: string;
  kind: LandingKind;
  path: string;
  title: string;
  /** The phrase before ", some with housing and meals." International has its own intro. */
  scope: string;
  query: DiscoveryQuery;
};

type Hit = { path: string; indexed: Date };

const cut = (value: string, max: number) => (value.length <= max ? value : value.slice(0, max));

const categoryTitle = (category: Category) => `${CATEGORY_LABELS[category]} jobs`;

function isCategory(slug: string): slug is Category {
  return CATEGORY_SLUGS.has(slug);
}

/** The UTC calendar date of `now`, so a caller-supplied day does not shift across time zones. */
function dayOf(now: Date): string {
  return todayIn('UTC', now);
}

/**
 * The season's year: this year while its window has not ended, otherwise next year.
 * Winter of year Y runs December Y through February Y+1, so January still belongs to Y.
 */
function seasonYear(season: Season, today: string): number {
  const year = Number(today.slice(0, 4));
  if (season === 'year_round') return year;
  const previous = seasonWindow(season, year - 1);
  if (previous && today >= previous.from && today <= previous.to) return year - 1;
  const current = seasonWindow(season, year);
  if (current && today <= current.to) return year;
  return year + 1;
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

function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** The same predicates as discovery's filter builder, for the fields a landing query uses. */
function matchSql(query: DiscoveryQuery): SQL {
  const parts: SQL[] = [];
  if (query.categories?.length) parts.push(sql`dl.categories && ${textArray(query.categories)}`);
  if (query.genres?.length) parts.push(sql`dl.genre = any(${textArray(query.genres)})`);
  if (query.states?.length) {
    const states = textArray(query.states);
    parts.push(sql`((not dl.remote and dl.state = any(${states}))
      or (dl.remote and dl.remote_states && (${states} || '{US}'::text[])))`);
  }
  if (query.destination) parts.push(sql`dl.destination_slug = ${query.destination}`);
  if (query.sponsorsVisas) parts.push(sql`dl.sponsors_visas`);
  if (query.start && 'season' in query.start) {
    parts.push(seasonMatchSql(query.start.season, query.start.year));
  }
  if (parts.length === 0) return sql`true`;
  if (parts.length === 1) return parts[0] ?? sql`true`;
  return sql.join(parts, sql` and `);
}

function canonicalPath(input: string): string | null {
  const bare = input.split(/[?#]/, 1)[0] ?? '';
  let path = bare.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  path = path.toLowerCase();
  if (path.includes('//')) return null;
  return path;
}

function stateTarget(state: NonNullable<ReturnType<typeof stateBySlug>>): Target | null {
  if (!state.landing) return null;
  const title = `Jobs in ${state.name}`;
  return {
    key: `state:${state.slug}`,
    kind: 'state',
    path: `/jobs/${state.slug}`,
    title,
    scope: title,
    query: { states: [state.code] },
  };
}

function categoryTarget(category: Category): Target {
  const title = categoryTitle(category);
  return {
    key: `category:${category}`,
    kind: 'category',
    path: `/jobs/${category}`,
    title,
    scope: title,
    query: { categories: [category] },
  };
}

function oneSegment(slug: string): Target | null {
  const state = stateBySlug(slug);
  if (state) return stateTarget(state);
  if (isCategory(slug)) return categoryTarget(slug);
  return null;
}

function twoSegments(categorySlug: string, sub: string): Target | null {
  if (!isCategory(categorySlug)) return null;
  const state = stateBySlug(sub);
  if (state?.landing) {
    const title = `${categoryTitle(categorySlug)} in ${state.name}`;
    return {
      key: `category_state:${categorySlug}:${state.slug}`,
      kind: 'category_state',
      path: `/jobs/${categorySlug}/${state.slug}`,
      title,
      scope: title,
      query: { categories: [categorySlug], states: [state.code] },
    };
  }
  const genre = GENRE_BY_SLUG.get(sub);
  if (!genre || genre.category !== categorySlug) return null;
  return {
    key: `category_genre:${categorySlug}:${sub}`,
    kind: 'category_genre',
    path: `/jobs/${categorySlug}/${sub}`,
    title: `${categoryTitle(categorySlug)} · ${genre.label}`,
    scope: `${categoryTitle(categorySlug)} in ${genre.label.toLowerCase()}`,
    query: { categories: [categorySlug], genres: [sub] },
  };
}

function seasonTarget(slug: string, today: string): Target | null {
  const season = SEASON_FROM_SLUG[slug];
  if (!season) return null;
  const year = seasonYear(season, today);
  const title = `${seasonLabel(season, year)} jobs`;
  return {
    key: `season:${slug}`,
    kind: 'season',
    path: `/seasons/${slug}`,
    title,
    scope: title,
    query: { start: { season, year } },
  };
}

async function destinationTarget(db: DbOrTx, slug: string): Promise<Target | null> {
  const found = (await listDestinations(db)).find((destination) => destination.slug === slug);
  if (!found) return null;
  const title = `Jobs near ${found.name}`;
  return {
    key: `destination:${found.slug}`,
    kind: 'destination',
    path: `/destinations/${found.slug}`,
    title,
    scope: title,
    query: { destination: found.slug },
  };
}

async function interpret(db: DbOrTx, path: string, today: string): Promise<Target | null> {
  const parts = path.slice(1).split('/').filter((part) => part.length > 0);
  const head = parts[0];
  if (!head) return null;
  if (parts.length === 1 && head === 'international') {
    return {
      key: 'international',
      kind: 'international',
      path: '/international',
      title: 'Working in the US from abroad',
      scope: 'Working in the US from abroad',
      query: { sponsorsVisas: true },
    };
  }
  if (parts.length === 2 && head === 'seasons') return seasonTarget(parts[1] ?? '', today);
  if (parts.length === 2 && head === 'destinations') return destinationTarget(db, parts[1] ?? '');
  if (head !== 'jobs') return null;
  if (parts.length === 2) return oneSegment(parts[1] ?? '');
  if (parts.length === 3) return twoSegments(parts[1] ?? '', parts[2] ?? '');
  return null;
}

async function hasMatch(db: DbOrTx, query: DiscoveryQuery): Promise<boolean> {
  const [row] = await queryRows<{ ok: boolean | string }>(
    db,
    sql`select exists(
      select 1 from app.discovery_listings dl
      where dl.is_active and ${matchSql(query)}
    ) as ok`,
  );
  return row?.ok === true || row?.ok === 't' || row?.ok === 'true';
}

async function heroFor(
  db: DbOrTx,
  mediaId: string | null,
  alt: string,
): Promise<{ url: string; alt: string } | null> {
  if (!mediaId) return null;
  try {
    const url = await getMediaUrl(db, getStorage(), SYSTEM_VIEWER, mediaId, 1280);
    return { url, alt };
  } catch (err) {
    if (!isAppError(err)) throw err;
    return null;
  }
}

/** The landing page at `path`, or null when the path is not one. */
export async function resolveLanding(
  db: DbOrTx,
  path: string,
  now: Date,
): Promise<LandingPage | null> {
  const canonical = canonicalPath(path);
  if (!canonical) return null;
  const target = await interpret(db, canonical, dayOf(now));
  if (!target) return null;

  const [stored] = await db
    .select()
    .from(landingPages)
    .where(eq(landingPages.key, target.key))
    .limit(1);
  const title = stored?.title ?? target.title;
  const intro =
    stored?.intro ??
    (target.kind === 'international'
      ? INTERNATIONAL_INTRO
      : `${target.scope}, some with housing and meals.`);
  const seoTitle = stored?.seoTitle ? cut(stored.seoTitle, 60) : cut(`${title} | Explore&Earn`, 60);
  const seoDescription = stored?.seoDescription
    ? cut(stored.seoDescription, 160)
    : cut(intro, 160);

  return {
    key: target.key,
    kind: target.kind,
    path: target.path,
    title,
    intro,
    hero: await heroFor(db, stored?.heroMediaId ?? null, stored?.heroAlt ?? title),
    seoTitle,
    seoDescription,
    query: target.query,
    indexable: await hasMatch(db, target.query),
    breadcrumbs: [
      { name: 'Jobs', path: '/' },
      { name: title, path: target.path },
    ],
  };
}

/** Epoch milliseconds, a Date, or an ISO string. Raw timestamptz text is not always parseable. */
function asDate(value: Date | number | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(value)) {
    const ms = Number(value);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function keep(hits: Map<string, Hit>, key: string, path: string, indexed: Date | null) {
  if (!indexed) return;
  const prev = hits.get(key);
  if (!prev || indexed > prev.indexed) hits.set(key, { path, indexed });
}

function landingState(code: string) {
  const state = stateByCode(code.trim());
  return state?.landing ? state : undefined;
}

/** Indexable landing paths only (the landing sitemap). */
export async function listLandingPaths(db: DbOrTx): Promise<{ path: string; lastmod: Date }[]> {
  const today = dayOf(new Date());
  const hits = new Map<string, Hit>();

  const states = await queryRows<{ code: string; indexed_at: Date | string }>(
    db,
    sql`select btrim(dl.state::text) as code, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      where dl.is_active and not dl.remote
      group by 1`,
  );
  for (const row of states) {
    const state = landingState(row.code);
    if (!state) continue;
    keep(hits, `state:${state.slug}`, `/jobs/${state.slug}`, asDate(row.indexed_at));
  }

  const remoteCodes = await queryRows<{ code: string; indexed_at: Date | string }>(
    db,
    sql`select btrim(u.code) as code, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      cross join lateral unnest(dl.remote_states) as u(code)
      where dl.is_active and dl.remote and u.code <> 'US'
      group by 1`,
  );
  for (const row of remoteCodes) {
    const state = landingState(row.code);
    if (!state) continue;
    keep(hits, `state:${state.slug}`, `/jobs/${state.slug}`, asDate(row.indexed_at));
  }

  const [remoteUs] = await queryRows<{ indexed_at: Date | string | null }>(
    db,
    sql`select (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      where dl.is_active and dl.remote and 'US' = any(dl.remote_states)`,
  );
  const anywhere = asDate(remoteUs?.indexed_at);
  if (anywhere) {
    for (const state of LANDING_STATES) {
      keep(hits, `state:${state.slug}`, `/jobs/${state.slug}`, anywhere);
    }
  }

  const categories = await queryRows<{ category: string; indexed_at: Date | string }>(
    db,
    sql`select c as category, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      cross join lateral unnest(dl.categories) as c
      where dl.is_active
      group by 1`,
  );
  for (const row of categories) {
    if (!isCategory(row.category)) continue;
    keep(
      hits,
      `category:${row.category}`,
      `/jobs/${row.category}`,
      asDate(row.indexed_at),
    );
  }

  const categoryStates = await queryRows<{
    category: string;
    code: string;
    indexed_at: Date | string;
  }>(
    db,
    sql`select c as category, btrim(dl.state::text) as code, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      cross join lateral unnest(dl.categories) as c
      where dl.is_active and not dl.remote
      group by 1, 2
      union all
      select c as category, btrim(u.code) as code, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      cross join lateral unnest(dl.categories) as c
      cross join lateral unnest(dl.remote_states) as u(code)
      where dl.is_active and dl.remote and u.code <> 'US'
      group by 1, 2`,
  );
  for (const row of categoryStates) {
    const state = landingState(row.code);
    if (!state || !isCategory(row.category)) continue;
    keep(
      hits,
      `category_state:${row.category}:${state.slug}`,
      `/jobs/${row.category}/${state.slug}`,
      asDate(row.indexed_at),
    );
  }

  const remoteCategoryStates = await queryRows<{ category: string; indexed_at: Date | string }>(
    db,
    sql`select c as category, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      cross join lateral unnest(dl.categories) as c
      where dl.is_active and dl.remote and 'US' = any(dl.remote_states)
      group by 1`,
  );
  for (const row of remoteCategoryStates) {
    if (!isCategory(row.category)) continue;
    const indexed = asDate(row.indexed_at);
    for (const state of LANDING_STATES) {
      keep(
        hits,
        `category_state:${row.category}:${state.slug}`,
        `/jobs/${row.category}/${state.slug}`,
        indexed,
      );
    }
  }

  const genreValues = sql.join(
    GENRES.map((genre) => sql`(${genre.code.replaceAll('_', '-')}, ${genre.category})`),
    sql`, `,
  );
  const genres = await queryRows<{ slug: string; category: string; indexed_at: Date | string }>(
    db,
    sql`select g.slug, g.category, (extract(epoch from max(dl.indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings dl
      join (values ${genreValues}) as g(slug, category)
        on dl.genre = g.slug::text and g.category::text = any(dl.categories)
      where dl.is_active
      group by g.slug, g.category`,
  );
  for (const row of genres) {
    if (!isCategory(row.category)) continue;
    keep(
      hits,
      `category_genre:${row.category}:${row.slug}`,
      `/jobs/${row.category}/${row.slug}`,
      asDate(row.indexed_at),
    );
  }

  const yearOf = (season: Season) => seasonYear(season, today);
  const [seasonRow] = await queryRows<Record<Season, Date | string | null>>(
    db,
    sql`select
      (extract(epoch from max(dl.indexed_at) filter (where ${seasonMatchSql('spring', yearOf('spring'))})) * 1000)::float8 as spring,
      (extract(epoch from max(dl.indexed_at) filter (where ${seasonMatchSql('summer', yearOf('summer'))})) * 1000)::float8 as summer,
      (extract(epoch from max(dl.indexed_at) filter (where ${seasonMatchSql('fall', yearOf('fall'))})) * 1000)::float8 as fall,
      (extract(epoch from max(dl.indexed_at) filter (where ${seasonMatchSql('winter', yearOf('winter'))})) * 1000)::float8 as winter,
      (extract(epoch from max(dl.indexed_at) filter (where ${seasonMatchSql('year_round', yearOf('year_round'))})) * 1000)::float8 as year_round
    from app.discovery_listings dl
    where dl.is_active`,
  );
  for (const season of Object.keys(SEASON_SLUG) as Season[]) {
    const slug = SEASON_SLUG[season];
    keep(hits, `season:${slug}`, `/seasons/${slug}`, asDate(seasonRow?.[season]));
  }

  const knownDestinations = new Map(
    (await listDestinations(db)).map((destination) => [destination.slug, destination]),
  );
  const destinations = await queryRows<{ slug: string; indexed_at: Date | string }>(
    db,
    sql`select destination_slug as slug, (extract(epoch from max(indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings
      where is_active and destination_slug is not null
      group by 1`,
  );
  for (const row of destinations) {
    if (!knownDestinations.has(row.slug)) continue;
    keep(hits, `destination:${row.slug}`, `/destinations/${row.slug}`, asDate(row.indexed_at));
  }

  const [international] = await queryRows<{ indexed_at: Date | string | null }>(
    db,
    sql`select (extract(epoch from max(indexed_at)) * 1000)::float8 as indexed_at
      from app.discovery_listings
      where is_active and sponsors_visas`,
  );
  keep(hits, 'international', '/international', asDate(international?.indexed_at));

  const copies = await db
    .select({ key: landingPages.key, updatedAt: landingPages.updatedAt })
    .from(landingPages);
  const revised = new Map(copies.map((copy) => [copy.key, copy.updatedAt]));

  return [...hits.entries()]
    .map(([key, hit]) => {
      const updated = revised.get(key);
      return { path: hit.path, lastmod: updated && updated > hit.indexed ? updated : hit.indexed };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
