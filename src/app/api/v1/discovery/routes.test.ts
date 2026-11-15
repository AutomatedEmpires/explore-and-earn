// The public discovery read API (SP3 spec section 5, plan Task 22): paging and geometry params
// that fail are a 400 with details, filter params that fail are dropped, an unknown time zone
// still works (Review Focus 3), every response is private, the search text never reaches the
// logs or analytics, and every route is documented.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { parseQuery, resolveTimeZone } from '@/lib/discovery';
import { logger } from '@/lib/logger';
import {
  getListingDetail,
  locationPreview,
  mapPins,
  prepareQuery,
  searchListings,
  suggest,
} from '@/modules/discovery';
import { buildOpenApi } from '@/server/openapi';
import { getViewer } from '@/server/viewer';
import { GET as getListing } from '../listings/[id]/route';
import { GET as getDeck } from './deck/route';
import { GET as getLocation } from './locations/[locationId]/route';
import { GET as getMap } from './map/route';
import { GET as getSearch } from './search/route';
import { GET as getSuggest } from './suggest/route';

vi.mock('@/server/viewer', async (orig) => ({
  ...(await orig<typeof import('@/server/viewer')>()),
  getViewer: vi.fn(),
}));
vi.mock('@/lib/analytics', async (orig) => ({
  ...(await orig<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
}));
vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  prepareQuery: vi.fn(),
  searchListings: vi.fn(),
  mapPins: vi.fn(),
  locationPreview: vi.fn(),
  suggest: vi.fn(),
  getListingDetail: vi.fn(),
}));

const BASE = 'http://localhost:3000';
const LOCATION = '019a4a3c-0000-7000-8000-00000000b001';
const LISTING = '019a4a3c-0000-7000-8000-00000000d001';
const EMPTY = { items: [], nextCursor: null, total: 0, totalCapped: false };

const get = (path: string) => new Request(`${BASE}${path}`);
const withParams = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  vi.mocked(getViewer).mockImplementation(async (req) => ({
    userId: null,
    seekerId: null,
    accountType: null,
    viewerKey: 'guest-key',
    tz: resolveTimeZone(new URL(req.url).searchParams.get('tz')),
  }));
  vi.mocked(prepareQuery).mockImplementation(async (_db, p) => {
    const { query, sort } = parseQuery(p);
    return { query, sort, labels: { genres: {}, destinations: {}, host: null } };
  });
  vi.mocked(searchListings).mockResolvedValue(EMPTY);
  vi.mocked(mapPins).mockResolvedValue({ pins: [], clusters: [], capped: false });
  vi.mocked(suggest).mockResolvedValue({ jobs: [], places: [], employers: [] });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const searchInput = () => vi.mocked(searchListings).mock.calls.at(-1)?.[1];

describe('GET /api/v1/discovery/search', () => {
  it('works with an unknown time zone (Review Focus 3)', async () => {
    const res = await getSearch(get('/api/v1/discovery/search?tz=Etc/Unknown'));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(EMPTY);
    expect(searchInput()).toMatchObject({ tz: 'America/Chicago', surface: 'seek', limit: 20 });
  });

  it('rejects a bad limit with details, and drops a bad filter', async () => {
    const bad = await getSearch(get('/api/v1/discovery/search?limit=51'));
    expect(bad.status).toBe(400);
    const err = (await body(bad)).error as { code: string; details?: unknown };
    expect(err.code).toBe('bad_request');
    expect(err.details).toBeDefined();

    const ok = await getSearch(get('/api/v1/discovery/search?cat=bogus&sort=pay'));
    expect(ok.status).toBe(200);
    expect(searchInput()).toMatchObject({ query: {}, sort: 'relevant' });
  });

  it('marks every response private, errors included', async () => {
    for (const path of ['/api/v1/discovery/search', '/api/v1/discovery/search?limit=0']) {
      expect((await getSearch(get(path))).headers.get('cache-control')).toBe('private, no-store');
    }
  });

  it('rounds the origin to 2 decimals', async () => {
    await getSearch(get('/api/v1/discovery/search?sort=distance&lat=39.7392&lng=-104.9903'));
    expect(searchInput()).toMatchObject({ sort: 'distance', origin: { lat: 39.74, lng: -104.99 } });
    expect((await getSearch(get('/api/v1/discovery/search?lat=91&lng=0'))).status).toBe(400);
    expect((await getSearch(get('/api/v1/discovery/search?lat=39.7'))).status).toBe(400);
  });

  it('takes the Map list only with a bbox', async () => {
    expect((await getSearch(get('/api/v1/discovery/search?surface=map_list'))).status).toBe(400);
    const res = await getSearch(
      get('/api/v1/discovery/search?surface=map_list&bbox=-109,37,-102,41'),
    );
    expect(res.status).toBe(200);
    expect(searchInput()).toMatchObject({
      surface: 'map_list',
      query: { bbox: [-109, 37, -102, 41] },
    });
    expect((await getSearch(get('/api/v1/discovery/search?surface=swipe'))).status).toBe(400);
  });

  it('tracks the search without its text', async () => {
    await getSearch(get('/api/v1/discovery/search?q=secretword&cat=farm,remote&sort=newest'));
    expect(track).toHaveBeenCalledWith('discovery_search', {
      surface: 'seek',
      sort: 'newest',
      filterCount: 2,
      hasQuery: true,
    });
    const props = vi.mocked(track).mock.calls[0]?.[1] ?? {};
    expect(props).not.toHaveProperty('q');
    expect(JSON.stringify(props)).not.toContain('secretword');
  });

  it('keeps the search text out of the error log', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const failure = Object.assign(
      new Error("Failed query: select websearch_to_tsquery('english', $1)\nparams: secretword"),
      { query: "select websearch_to_tsquery('english', $1)", params: ['secretword'] },
    );
    failure.cause = new Error('syntax error in tsquery: "SecretWord"');
    vi.mocked(searchListings).mockRejectedValueOnce(failure);

    const res = await getSearch(get('/api/v1/discovery/search?q=secretword'));
    expect(res.status).toBe(500);
    expect(error).toHaveBeenCalled();
    const seen = JSON.stringify(error.mock.calls, (_key, v: unknown) =>
      v instanceof Error
        ? { ...v, name: v.name, message: v.message, stack: v.stack, cause: v.cause }
        : v,
    );
    expect(seen.toLowerCase()).not.toContain('secretword');
  });

  it('passes a cursor through and rejects an oversized one', async () => {
    await getSearch(get('/api/v1/discovery/search?cursor=abc'));
    expect(searchInput()?.cursor).toBe('abc');
    expect(
      (await getSearch(get(`/api/v1/discovery/search?cursor=${'a'.repeat(2049)}`))).status,
    ).toBe(400);
  });
});

describe('GET /api/v1/discovery/deck', () => {
  it('limits the deck to 20 cards', async () => {
    expect((await getDeck(get('/api/v1/discovery/deck?limit=21'))).status).toBe(400);
    const res = await getDeck(get('/api/v1/discovery/deck?cat=farm'));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ items: [], nextCursor: null });
    expect(searchInput()).toMatchObject({
      surface: 'swipe',
      limit: 10,
      query: { categories: ['farm'] },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /api/v1/discovery/map', () => {
  it('validates the bbox and zoom, and accepts a box across the antimeridian', async () => {
    expect((await getMap(get('/api/v1/discovery/map?bbox=0,91,1,92&zoom=4'))).status).toBe(400);
    expect((await getMap(get('/api/v1/discovery/map?bbox=0,1,2,3&zoom=23'))).status).toBe(400);
    expect((await getMap(get('/api/v1/discovery/map?zoom=4'))).status).toBe(400);
    const res = await getMap(get('/api/v1/discovery/map?bbox=170,50,-130,72&zoom=4&cat=maritime'));
    expect(res.status).toBe(200);
    expect(vi.mocked(mapPins).mock.calls.at(-1)?.[1]).toMatchObject({
      bbox: [170, 50, -130, 72],
      zoom: 4,
      query: { categories: ['maritime'] },
      viewerUserId: null,
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /api/v1/discovery/locations/{locationId}', () => {
  it('is a 404 for a location without active listings', async () => {
    vi.mocked(locationPreview).mockResolvedValueOnce(null);
    const res = await getLocation(
      get(`/api/v1/discovery/locations/${LOCATION}`),
      withParams({ locationId: LOCATION }),
    );
    expect(res.status).toBe(404);
    expect(((await body(res)).error as { code: string }).code).toBe('not_found');
  });

  it('returns the preview', async () => {
    const preview = {
      host: {
        orgId: 'o',
        name: 'Kettle Ridge Lodge',
        slug: 'kettle-ridge-lodge',
        logoUrl: null,
        locationLabel: 'Breckenridge, CO',
        approximate: true,
        categories: ['seasonal' as const],
        remoteLine: null,
      },
      matchingCount: 0,
      activeCount: 1,
      items: [],
      nextCursor: null,
    };
    vi.mocked(locationPreview).mockResolvedValueOnce(preview);
    const res = await getLocation(
      get(`/api/v1/discovery/locations/${LOCATION}?cat=farm&cursor=abc`),
      withParams({ locationId: LOCATION }),
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(preview);
    expect(vi.mocked(locationPreview).mock.calls.at(-1)?.[1]).toMatchObject({
      locationId: LOCATION,
      cursor: 'abc',
      query: { categories: ['farm'] },
    });
  });
});

describe('GET /api/v1/discovery/suggest', () => {
  it('needs 2 to 100 characters', async () => {
    expect((await getSuggest(get('/api/v1/discovery/suggest?q=a'))).status).toBe(400);
    expect((await getSuggest(get(`/api/v1/discovery/suggest?q=${'a'.repeat(101)}`))).status).toBe(
      400,
    );
    const res = await getSuggest(get('/api/v1/discovery/suggest?q=ka'));
    expect(res.status).toBe(200);
    expect(suggest).toHaveBeenCalledWith(expect.anything(), 'ka');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /api/v1/listings/{id}', () => {
  it('is a 404 for an unknown or removed listing, and the closed card for a closed one', async () => {
    vi.mocked(getListingDetail).mockResolvedValueOnce(null);
    const missing = await getListing(
      get(`/api/v1/listings/${LISTING}`),
      withParams({ id: LISTING }),
    );
    expect(missing.status).toBe(404);

    const card = { listingId: LISTING, status: 'closed' };
    vi.mocked(getListingDetail).mockResolvedValueOnce({
      status: 'closed',
      card: card as never,
    });
    const closed = await getListing(
      get(`/api/v1/listings/${LISTING}?tz=Etc/Unknown`),
      withParams({ id: LISTING }),
    );
    expect(closed.status).toBe(200);
    expect(await body(closed)).toEqual({ status: 'closed', card });
    expect(vi.mocked(getListingDetail).mock.calls.at(-1)?.[1]).toEqual({
      listingId: LISTING,
      viewerUserId: null,
      tz: 'America/Chicago',
    });
    expect(closed.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('OpenAPI', () => {
  it('documents all six read routes', () => {
    const paths = Object.keys(buildOpenApi().paths);
    for (const p of [
      '/api/v1/discovery/search',
      '/api/v1/discovery/deck',
      '/api/v1/discovery/map',
      '/api/v1/discovery/locations/{locationId}',
      '/api/v1/discovery/suggest',
      '/api/v1/listings/{id}',
    ]) {
      expect(paths).toContain(p);
    }
  });
});
