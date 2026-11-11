// POST /api/v1/listings/:id/events (SP3 plan Task 24): bots and missing user agents write
// nothing, a cross-origin post is refused, views dedupe per viewer, and an unknown source is
// 'other'.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../../../../../tests/helpers/db';
import { insertProjectionRows } from '../../../../../../../tests/helpers/discovery-rows';
import { queryRows, type Db } from '@/lib/db';
import { dedupeKeyFor, noopHook, setPlacementHookForTests } from '@/modules/discovery';
import { hmacKey, viewerKeyFor } from '@/server/viewer';
import { LISTING_EVENT_RATE, POST } from './route';

const state = vi.hoisted(() => ({ db: undefined as Db | undefined }));

vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
}));

// Every caller here is a guest.
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null, orgId: null }),
  currentUser: async () => null,
}));

const APP_URL = 'http://localhost:3000';
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

let t: TestDb;
let listing: string;

beforeAll(async () => {
  t = await createTestDb();
  state.db = t.db;
});

afterAll(async () => {
  state.db = undefined;
  await t.close();
});

beforeEach(async () => {
  setPlacementHookForTests(noopHook);
  await t.db.execute(sql`delete from app.rate_limits`);
  await t.db.execute(sql`delete from app.listing_events`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  [listing] = (await insertProjectionRows(t.db, [{}])) as [string];
});

afterAll(() => {
  setPlacementHookForTests(null);
});

function post(
  body: unknown,
  o: { userAgent?: string | null; origin?: string; ip?: string; id?: string } = {},
): Promise<Response> {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: o.origin ?? APP_URL,
    'x-forwarded-for': o.ip ?? '203.0.113.7',
  });
  const ua = o.userAgent === undefined ? CHROME : o.userAgent;
  if (ua !== null) headers.set('user-agent', ua);
  const id = o.id ?? listing;
  return POST(
    new Request(`${APP_URL}/api/v1/listings/${id}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const rows = () =>
  queryRows<{ type: string; source: string; viewerHash: string | null; dedupeKey: string | null }>(
    t.db,
    sql`select type, source, viewer_hash as "viewerHash", dedupe_key as "dedupeKey"
      from app.listing_events order by occurred_at`,
  );

describe('POST /api/v1/listings/:id/events', () => {
  it("records a guest's view once per 30 minutes, keyed by a hash of the address", async () => {
    const before = new Date();
    const res = await post({ type: 'view', source: 'seek' });
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect((await post({ type: 'view', source: 'seek' })).status).toBe(204);
    const after = new Date();

    const viewerKey = viewerKeyFor({ userId: null, ip: '203.0.113.7', userAgent: CHROME });
    const written = await rows();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      type: 'view',
      source: 'seek',
      viewerHash: hmacKey(viewerKey),
    });
    // The request's own 30-minute bucket (the clock may cross a boundary mid-test).
    expect([
      dedupeKeyFor('view', viewerKey, listing, before),
      dedupeKeyFor('view', viewerKey, listing, after),
    ]).toContain(written[0]?.dedupeKey);

    // Another viewer counts separately; a share is its own event.
    await post({ type: 'view', source: 'seek' }, { ip: '198.51.100.4' });
    await post({ type: 'share', source: 'seek' });
    expect((await rows()).map((r) => r.type)).toEqual(['view', 'view', 'share']);
  });

  it('counts one view for one address when the browser changes', async () => {
    await post({ type: 'view', source: 'seek' }, { userAgent: CHROME });
    await post({ type: 'view', source: 'seek' }, { userAgent: 'Safari/605.1.15' });
    expect(await rows()).toHaveLength(1);
  });

  it('does not let the client claim a boost', async () => {
    await post({ type: 'view', source: 'boost' });
    expect((await rows())[0]?.source).toBe('other');
  });

  it('records boost when the server says the listing is boosted', async () => {
    setPlacementHookForTests({
      ...noopHook,
      boostedAmong: async () => new Map([[listing, 'b1']]),
    });
    await post({ type: 'view', source: 'boost' });
    await post({ type: 'view', source: 'seek' }, { ip: '198.51.100.9' });
    const written = await rows();
    expect(written).toHaveLength(2);
    expect(written.map((r) => r.source).sort()).toEqual(['boost', 'seek']);
  });

  it('returns 429 once an address is over the event limit, and does not store the address', async () => {
    const ip = '203.0.113.50';
    for (let i = 0; i < LISTING_EVENT_RATE.limit; i++) {
      expect((await post({ type: 'view', source: 'seek' }, { ip })).status).toBe(204);
    }
    // Repeats of one listing collapse to a single row, so the over-limit call uses another
    // listing: that view would be stored if the limiter did not stop the handler.
    const [other] = (await insertProjectionRows(t.db, [{}])) as [string];
    const blocked = await post({ type: 'view', source: 'seek' }, { ip, id: other });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    const written = await queryRows<{ listingId: string }>(
      t.db,
      sql`select listing_id::text as "listingId" from app.listing_events`,
    );
    expect(written.map((r) => r.listingId)).toEqual([listing]);
    const keys = await queryRows<{ key: string }>(
      t.db,
      sql`select key from app.rate_limits`,
    );
    expect(keys.some((k) => k.key.includes(ip))).toBe(false);
    expect(keys.every((k) => k.key.startsWith('listing-events:'))).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('attributes an unknown or missing source to other', async () => {
    await post({ type: 'view', source: 'newsletter' });
    await post({ type: 'share' });
    expect((await rows()).map((r) => r.source)).toEqual(['other', 'other']);
  });

  it('writes nothing for Googlebot', async () => {
    const res = await post(
      { type: 'view', source: 'seek' },
      { userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    );
    expect(res.status).toBe(204);
    expect(await rows()).toEqual([]);
  });

  it('writes nothing without a user agent', async () => {
    const res = await post({ type: 'view', source: 'seek' }, { userAgent: null });
    expect(res.status).toBe(204);
    expect(await rows()).toEqual([]);
  });

  it('returns 204 and writes nothing for an unknown listing', async () => {
    const res = await post({ type: 'view', source: 'seek' }, { id: 'not-a-listing' });
    expect(res.status).toBe(204);
    expect(await rows()).toEqual([]);
  });

  it('refuses a cross-origin post with 403', async () => {
    const res = await post({ type: 'view', source: 'seek' }, { origin: 'https://evil.test' });
    expect(res.status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it('returns 400 for a type other than view or share', async () => {
    expect((await post({ type: 'save', source: 'seek' })).status).toBe(400);
    expect(await rows()).toEqual([]);
  });
});
