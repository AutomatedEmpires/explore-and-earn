// /api/v1/me/dispositions (SP3 plan Task 23): seekers only, input validation, the 120-a-minute
// limit, the 409 and 404 envelopes, DELETE's { previous } and the paged GET.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../../../../tests/helpers/db';
import { insertProjectionRows } from '../../../../../../tests/helpers/discovery-rows';
import { seedHostOrg, seedSeeker } from '../../../../../../tests/helpers/sp2';
import { queryRows, type Db } from '@/lib/db';
import { noopHook, setPlacementHookForTests } from '@/modules/discovery';
import { consume } from '@/modules/ratelimit';
import { DELETE, PUT } from './[listingId]/route';
import { GET } from './route';

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  clerkUserId: null as string | null,
}));

vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
}));

// The real guards run against the test database; Clerk only says who is signed in.
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: state.clerkUserId, orgId: null }),
  currentUser: async () => null,
}));

const APP_URL = 'http://localhost:3000';

let t: TestDb;
let seeker: { id: string; clerkUserId: string };
let host: { clerkUserId: string };
let listing: string;

beforeAll(async () => {
  t = await createTestDb();
  state.db = t.db;
  setPlacementHookForTests(noopHook);
});

afterAll(async () => {
  setPlacementHookForTests(null);
  state.db = undefined;
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  await t.db.execute(sql`delete from app.rate_limits`);
  const s = await seedSeeker(t.db);
  seeker = { id: s.userId, clerkUserId: s.user.clerkUserId };
  host = { clerkUserId: (await seedHostOrg(t.db)).owner.clerkUserId };
  [listing] = (await insertProjectionRows(t.db, [{}])) as [string];
  state.clerkUserId = seeker.clerkUserId;
});

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

function write(method: 'PUT' | 'DELETE', id: string, body?: unknown): Request {
  return new Request(`${APP_URL}/api/v1/me/dispositions/${id}`, {
    method,
    headers: { 'content-type': 'application/json', origin: APP_URL },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (listingId: string) => ({ params: Promise.resolve({ listingId }) });
const put = (body?: unknown, id = listing) => PUT(write('PUT', id, body), params(id));
const del = (body?: unknown, id = listing) => DELETE(write('DELETE', id, body), params(id));
const get = (query: string) => GET(new Request(`${APP_URL}/api/v1/me/dispositions?${query}`));

describe('PUT /api/v1/me/dispositions/:listingId', () => {
  it('saves, then skips, returning the previous state with private no-store caching', async () => {
    const res = await put({ state: 'saved', source: 'seek' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ state: 'saved', previous: null });
    const again = await put({ state: 'skipped', source: 'swipe', expectedState: 'saved' });
    expect(await again.json()).toEqual({ state: 'skipped', previous: 'saved' });
  });

  it('attributes an unknown source to other', async () => {
    await put({ state: 'saved', source: 'newsletter' });
    const [row] = await queryRows<{ source: string }>(
      t.db,
      sql`select source from app.listing_dispositions`,
    );
    expect(row?.source).toBe('other');
  });

  it('returns 400 without a body', async () => {
    const res = await put();
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe('bad_request');
  });

  it('returns 409 with the current state when expectedState is stale', async () => {
    await put({ state: 'skipped', source: 'swipe' });
    const res = await put({ state: 'saved', source: 'seek', expectedState: null });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error).toMatchObject({
      code: 'conflict',
      message: 'This job changed in another tab.',
      details: { current: 'skipped' },
    });
  });

  it('returns 404 "This job just closed." for a closed listing', async () => {
    await t.db.execute(sql`update app.discovery_listings set is_active = false, closed_at = now()`);
    const res = await put({ state: 'saved', source: 'seek' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.message).toBe('This job just closed.');
  });

  it('returns 403 for a host session and 401 for a guest', async () => {
    state.clerkUserId = host.clerkUserId;
    expect((await put({ state: 'saved', source: 'seek' })).status).toBe(403);
    expect((await del()).status).toBe(403);
    expect((await get('state=saved')).status).toBe(403);
    state.clerkUserId = null;
    expect((await put({ state: 'saved', source: 'seek' })).status).toBe(401);
  });

  it('returns 429 on the 121st change in a minute', async () => {
    // Start inside a window, so the minute cannot roll over mid-test.
    const intoWindow = Date.now() % 60_000;
    if (intoWindow > 50_000) await new Promise((r) => setTimeout(r, 60_500 - intoWindow));
    for (let n = 0; n < 119; n++) await consume(t.db, `disp:${seeker.id}`, 120, 60);
    expect((await put({ state: 'saved', source: 'seek' })).status).toBe(200);
    const res = await del();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  }, 30_000);
});

describe('DELETE /api/v1/me/dispositions/:listingId', () => {
  it('clears the disposition and returns { previous }', async () => {
    await put({ state: 'saved', source: 'seek' });
    const res = await del({ expectedState: 'saved' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ previous: 'saved' });
    expect(await (await del()).json()).toEqual({ previous: null });
  });

  it('returns 409 when expectedState is stale', async () => {
    await put({ state: 'skipped', source: 'swipe' });
    const res = await del({ expectedState: 'saved' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error.details).toEqual({ current: 'skipped' });
  });
});

describe('GET /api/v1/me/dispositions', () => {
  it("pages the seeker's saved jobs", async () => {
    const ids = await insertProjectionRows(t.db, [{}, {}]);
    for (const id of [listing, ...ids]) await put({ state: 'saved', source: 'seek' }, id);
    const first = await get('state=saved&limit=2');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    const page = (await first.json()) as {
      items: { listingId: string }[];
      nextBefore: string;
      total: number;
    };
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    const second = (await (await get(`state=saved&limit=2&before=${page.nextBefore}`)).json()) as {
      items: { listingId: string }[];
      nextBefore: string | null;
    };
    expect(second.items).toHaveLength(1);
    expect(second.nextBefore).toBeNull();
    expect(new Set([...page.items, ...second.items].map((c) => c.listingId))).toEqual(
      new Set([listing, ...ids]),
    );
  });

  it('lists skipped jobs', async () => {
    await put({ state: 'skipped', source: 'swipe' });
    const body = (await (await get('state=skipped')).json()) as { total: number };
    expect(body.total).toBe(1);
  });

  it('returns 400 without a state, past the 50 limit, or for a malformed cursor', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('state=applied')).status).toBe(400);
    expect((await get('state=saved&limit=51')).status).toBe(400);
    expect((await get('state=saved&before=garbage')).status).toBe(400);
  });
});
