// Landing page resolution: a path to a pre-filtered query with its copy (SP3 spec 3.2 and
// 8.11, plan Task 40). A page is indexable when at least one active listing matches. The
// landing sitemap asks listLandingPaths for those pages, counted in grouped queries rather
// than one search per page.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
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
import { hasActiveListing, landingCoverage } from '@/modules/discovery';
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

async function hasMatch(db: DbOrTx, query: DiscoveryQuery, today: string): Promise<boolean> {
  return hasActiveListing(db, query, today);
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
    indexable: await hasMatch(db, target.query, dayOf(now)),
    breadcrumbs: [
      { name: 'Jobs', path: '/' },
      { name: title, path: target.path },
    ],
  };
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
  const coverage = await landingCoverage(db, {
    seasons: (Object.keys(SEASON_SLUG) as Season[]).map((season) => ({
      season,
      year: seasonYear(season, today),
    })),
  });

  for (const row of coverage.onSiteStates) {
    const state = landingState(row.code);
    if (!state) continue;
    keep(hits, `state:${state.slug}`, `/jobs/${state.slug}`, row.indexedAt);
  }

  for (const row of coverage.remoteStates) {
    const state = landingState(row.code);
    if (!state) continue;
    keep(hits, `state:${state.slug}`, `/jobs/${state.slug}`, row.indexedAt);
  }

  if (coverage.remoteAnywhereAt) {
    for (const state of LANDING_STATES) {
      keep(hits, `state:${state.slug}`, `/jobs/${state.slug}`, coverage.remoteAnywhereAt);
    }
  }

  for (const row of coverage.categories) {
    if (!isCategory(row.category)) continue;
    keep(hits, `category:${row.category}`, `/jobs/${row.category}`, row.indexedAt);
  }

  for (const row of coverage.categoryStates) {
    const state = landingState(row.code);
    if (!state || !isCategory(row.category)) continue;
    keep(
      hits,
      `category_state:${row.category}:${state.slug}`,
      `/jobs/${row.category}/${state.slug}`,
      row.indexedAt,
    );
  }

  for (const row of coverage.remoteCategoryAnywhere) {
    if (!isCategory(row.category)) continue;
    for (const state of LANDING_STATES) {
      keep(
        hits,
        `category_state:${row.category}:${state.slug}`,
        `/jobs/${row.category}/${state.slug}`,
        row.indexedAt,
      );
    }
  }

  for (const row of coverage.genres) {
    if (!isCategory(row.category)) continue;
    keep(
      hits,
      `category_genre:${row.category}:${row.slug}`,
      `/jobs/${row.category}/${row.slug}`,
      row.indexedAt,
    );
  }

  for (const row of coverage.seasons) {
    const slug = SEASON_SLUG[row.season];
    keep(hits, `season:${slug}`, `/seasons/${slug}`, row.indexedAt);
  }

  const knownDestinations = new Map(
    (await listDestinations(db)).map((destination) => [destination.slug, destination]),
  );
  for (const row of coverage.destinations) {
    if (!knownDestinations.has(row.slug)) continue;
    keep(hits, `destination:${row.slug}`, `/destinations/${row.slug}`, row.indexedAt);
  }

  keep(hits, 'international', '/international', coverage.internationalAt);

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
