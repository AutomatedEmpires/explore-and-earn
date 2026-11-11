// A query with its display labels, and the filter options (SP3 plan Task 21).
// - prepareQuery is parseQuery with the `host` slug resolved to an orgId through the
//   projection; an unknown slug drops the filter (spec 8.1: invalid params are dropped).
// - getQueryLabels names the genres, destinations and host a query refers to.
// - getFilterOptions is what the filter panel offers.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  DEFAULT_TZ,
  parseQuery,
  todayIn,
  US_STATES,
  type DiscoveryQuery,
  type DiscoverySort,
  type FilterOptions,
  type QueryLabels,
} from '@/lib/discovery';
import { GENRES } from '@/lib/taxonomy';
import { listDestinations } from '@/modules/locations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SP2 genre codes are snake_case; discovery slugs use hyphens ('ski_resorts' -> 'ski-resorts'). */
const genreSlug = (code: string) => code.replace(/_/g, '-');

type HostLabel = NonNullable<QueryLabels['host']>;

/** The host with this slug or org, from its most recently indexed row (active rows first). */
async function findHost(
  db: DbOrTx,
  by: { slug: string } | { orgId: string },
): Promise<HostLabel | null> {
  const where = 'slug' in by ? sql`dl.host_slug = ${by.slug}` : sql`dl.org_id = ${by.orgId}::uuid`;
  const [row] = await queryRows<HostLabel>(
    db,
    sql`select dl.org_id::text as "orgId", dl.host_slug as slug, dl.host_name as name
      from app.discovery_listings dl
      where ${where}
      order by dl.is_active desc, dl.indexed_at desc
      limit 1`,
  );
  return row ?? null;
}

/** parseQuery, with the `host` slug resolved to an orgId (an unknown slug drops the filter). */
export async function prepareQuery(
  db: DbOrTx,
  p: URLSearchParams,
): Promise<{ query: DiscoveryQuery; sort: DiscoverySort; labels: QueryLabels }> {
  const { query, sort, hostSlug } = parseQuery(p);
  const host = hostSlug ? await findHost(db, { slug: hostSlug }) : null;
  const resolved: DiscoveryQuery = host ? { ...query, orgId: host.orgId } : query;
  return { query: resolved, sort, labels: await getQueryLabels(db, resolved, host) };
}

/** Every genre label and destination name, and the query's host. */
export async function getQueryLabels(
  db: DbOrTx,
  q: DiscoveryQuery,
  knownHost?: HostLabel | null,
): Promise<QueryLabels> {
  const destinations = await listDestinations(db);
  let host: HostLabel | null = null;
  if (q.orgId && UUID.test(q.orgId)) {
    host = knownHost?.orgId === q.orgId ? knownHost : await findHost(db, { orgId: q.orgId });
  }
  return {
    genres: Object.fromEntries(GENRES.map((g) => [genreSlug(g.code), g.label])),
    destinations: Object.fromEntries(destinations.map((d) => [d.slug, d.name])),
    host,
  };
}

export async function getFilterOptions(db: DbOrTx, now = new Date()): Promise<FilterOptions> {
  const year = Number(todayIn(DEFAULT_TZ, now).slice(0, 4));
  const destinations = await listDestinations(db);
  return {
    genres: GENRES.map((g) => ({ slug: genreSlug(g.code), label: g.label, category: g.category })),
    states: [...US_STATES]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ code: s.code, name: s.name })),
    destinations: destinations
      .map((d) => ({ slug: d.slug, name: d.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    seasonYears: [year, year + 1],
  };
}
