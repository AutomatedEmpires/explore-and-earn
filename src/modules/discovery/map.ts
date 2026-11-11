// Map pins, server clusters and the location preview (SP3 spec 8.6, plan Task 20).
//
// - A pin is one location with at least one matching listing, at its public point. Its category
//   is the one most of its matches have (ties go in PIN_CATEGORY_ORDER), and it is boosted when
//   boostedAmong covers any of them. Remote listings sit at their host's location.
// - Above MAX_PINS locations the server returns grid clusters instead (ST_SnapToGrid, cell
//   360 / 2^(zoom + 2) degrees) with `capped: true`.
// - The location preview counts every active listing there and pages the matching ones.
// Every query goes through buildFilterSql, so a closed or removed listing is never on the map.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  DEFAULT_TZ,
  PIN_CATEGORY_ORDER,
  stateByCode,
  todayIn,
  type DiscoveryQuery,
  type HostPreview,
  type JobCardData,
  type MapCluster,
  type MapPin,
} from '@/lib/discovery';
import type { Category } from '@/lib/taxonomy';
import { boostedLabels } from './cards';
import { buildFilterSql, uuidArray, type FilterContext } from './filters';
import { overlayHidden } from './hooks';
import { searchListings } from './search';

export const MAX_PINS = 2000;
/** Matches per page of the location preview. */
export const PREVIEW_PAGE_SIZE = 20;
const REMOTE_STATES_SHOWN = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The side of a server cluster cell, in degrees. */
export function clusterCellDegrees(zoom: number): number {
  return 360 / 2 ** (zoom + 2);
}

const rank = (c: Category) => PIN_CATEGORY_ORDER.indexOf(c);
const byPinOrder = (a: Category, b: Category) => rank(a) - rank(b);

/** The map's WHERE clause: the query in the box, without skipped listings or blocked hosts. */
async function mapWhere(
  db: DbOrTx,
  query: DiscoveryQuery,
  viewerUserId: string | null,
  today: string,
): Promise<SQL> {
  const ctx: FilterContext = {
    today,
    viewerUserId,
    surface: 'map_list',
    applied: [],
    hidden: viewerUserId ? await overlayHidden(db, viewerUserId) : [],
  };
  return buildFilterSql(query, ctx);
}

type PinGroup = {
  locationId: string;
  orgId: string;
  lat: number;
  lng: number;
  category: Category;
  n: number;
  remoteOnly: boolean;
  ids: string[];
};

async function pinsFrom(db: DbOrTx, where: SQL): Promise<MapPin[]> {
  const groups = await queryRows<PinGroup>(
    db,
    sql`select dl.location_id::text as "locationId", min(dl.org_id::text) as "orgId",
        min(ST_Y(dl.geog::geometry))::float8 as lat, min(ST_X(dl.geog::geometry))::float8 as lng,
        dl.category, count(*)::int as n, bool_and(dl.remote) as "remoteOnly",
        array_agg(dl.listing_id::text) as ids
      from app.discovery_listings dl
      where ${where}
      group by dl.location_id, dl.category`,
  );
  const boosted = await boostedLabels(
    db,
    groups.flatMap((g) => g.ids),
    new Date(),
  );

  const pins = new Map<string, MapPin & { counts: Map<Category, number> }>();
  for (const g of groups) {
    const pin = pins.get(g.locationId) ?? {
      kind: 'pin' as const,
      locationId: g.locationId,
      orgId: g.orgId,
      lat: g.lat,
      lng: g.lng,
      category: g.category,
      categories: [],
      remoteOnly: true,
      matchingCount: 0,
      boosted: false,
      counts: new Map<Category, number>(),
    };
    pin.counts.set(g.category, (pin.counts.get(g.category) ?? 0) + g.n);
    pin.matchingCount += g.n;
    pin.remoteOnly &&= g.remoteOnly;
    pin.boosted ||= g.ids.some((id) => boosted.has(id));
    pins.set(g.locationId, pin);
  }
  return [...pins.values()]
    .map(({ counts, ...pin }) => {
      const categories = [...counts.keys()].sort(byPinOrder);
      const category =
        [...categories].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0] ??
        pin.category;
      return { ...pin, categories, category };
    })
    .sort((a, b) => b.matchingCount - a.matchingCount || a.locationId.localeCompare(b.locationId));
}

async function clustersFrom(db: DbOrTx, where: SQL, zoom: number): Promise<MapCluster[]> {
  const cell = clusterCellDegrees(zoom);
  const rows = await queryRows<{ lat: number; lng: number; listings: number; locations: number }>(
    db,
    sql`with locs as (
        select dl.location_id, min(ST_X(dl.geog::geometry)) as x,
          min(ST_Y(dl.geog::geometry)) as y, count(*)::int as n
        from app.discovery_listings dl
        where ${where}
        group by dl.location_id
      ), cells as (
        select x, y, n, ST_SnapToGrid(ST_MakePoint(x, y), ${cell}::float8) as g from locs
      )
      select avg(y)::float8 as lat, avg(x)::float8 as lng, sum(n)::int as listings,
        count(*)::int as locations
      from cells
      group by ST_X(g), ST_Y(g)
      order by listings desc, lat, lng`,
  );
  return rows.map((r) => ({ kind: 'cluster', ...r }));
}

export async function mapPins(
  db: DbOrTx,
  i: {
    query: DiscoveryQuery;
    bbox: [number, number, number, number];
    zoom: number;
    viewerUserId: string | null;
    /** The viewer's zone, for the date filters; America/Chicago when absent. */
    tz?: string;
  },
): Promise<{ pins: MapPin[]; clusters: MapCluster[]; capped: boolean }> {
  const where = await mapWhere(
    db,
    { ...i.query, bbox: i.bbox },
    i.viewerUserId,
    todayIn(i.tz ?? DEFAULT_TZ),
  );
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from (
      select distinct dl.location_id from app.discovery_listings dl where ${where}
      limit ${MAX_PINS + 1}::int) l`,
  );
  if ((row?.n ?? 0) > MAX_PINS) {
    return { pins: [], clusters: await clustersFrom(db, where, i.zoom), capped: true };
  }
  return { pins: await pinsFrom(db, where), clusters: [], capped: false };
}

/** "Remote · host based in Seward, AK · work from: US" (or up to 5 codes, then " +N more"). */
function remoteLine(base: string, states: string[] | null): string | null {
  if (states === null) return null;
  const codes = [...new Set(states)].sort();
  let where: string;
  if (codes.includes('US')) where = 'US';
  else {
    const more = codes.length - REMOTE_STATES_SHOWN;
    where = `${codes.slice(0, REMOTE_STATES_SHOWN).join(', ')}${more > 0 ? ` +${more} more` : ''}`;
  }
  return `Remote · host based in ${base} · work from: ${where}`;
}

type HostRow = {
  orgId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  city: string | null;
  state: string;
  approximate: boolean;
  categories: Category[];
  activeCount: number;
  remoteStates: string[] | null;
};

/** Null when the location has no active listing a guest or this viewer can see. */
export async function locationPreview(
  db: DbOrTx,
  i: {
    locationId: string;
    query: DiscoveryQuery;
    cursor?: string;
    tz: string;
    viewerUserId: string | null;
  },
): Promise<{
  host: HostPreview;
  matchingCount: number;
  activeCount: number;
  items: JobCardData[];
  nextCursor: string | null;
} | null> {
  if (!UUID.test(i.locationId)) return null;
  // Same hidden-org exclusion as mapWhere. A blocked host is not a preview, and when that
  // exclusion removes every active row the location is null.
  const hidden = i.viewerUserId ? await overlayHidden(db, i.viewerUserId) : [];
  const hiddenOrg =
    hidden.length > 0 ? sql`and dl.org_id <> all(${uuidArray(hidden)})` : sql``;
  // The host and its location come from the most recently indexed visible row there.
  const [h] = await queryRows<HostRow>(
    db,
    sql`with here as (
        select * from app.discovery_listings dl
        where dl.location_id = ${i.locationId}::uuid and dl.is_active ${hiddenOrg}
      )
      select h.org_id::text as "orgId", h.host_name as name, h.host_slug as slug,
        h.host_logo_url as "logoUrl", h.city, h.state::text as state, h.approximate,
        (select array_agg(distinct x.category) from here x) as categories,
        (select count(*)::int from here) as "activeCount",
        (select array_agg(s) from here r, unnest(r.remote_states) s where r.remote) as "remoteStates"
      from here h
      order by h.indexed_at desc, h.listing_id desc
      limit 1`,
  );
  if (!h) return null;

  const page = await searchListings(db, {
    query: { ...i.query, locationId: i.locationId },
    sort: 'relevant',
    surface: 'map_list',
    cursor: i.cursor,
    limit: PREVIEW_PAGE_SIZE,
    tz: i.tz,
    viewerUserId: i.viewerUserId,
    viewerKey: '',
  });
  const base = h.city ? `${h.city}, ${h.state}` : (stateByCode(h.state)?.name ?? h.state);
  return {
    host: {
      orgId: h.orgId,
      name: h.name,
      slug: h.slug,
      logoUrl: h.logoUrl,
      locationLabel: base,
      approximate: h.approximate,
      categories: [...h.categories].sort(byPinOrder),
      remoteLine: remoteLine(base, h.remoteStates),
    },
    matchingCount: page.total,
    activeCount: h.activeCount,
    items: page.items,
    nextCursor: page.nextCursor,
  };
}
