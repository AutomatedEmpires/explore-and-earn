// /api/v1/me/saved-searches and /api/v1/me/alert-settings (SP3 plan Task 28): seekers only,
// 201 for a new search and 200 for one the seeker already has, the 409 at the limit, owner
// checks, the shared 30-an-hour write limit, and the weekly digest switch.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../../../../tests/helpers/db';
import { seedHostOrg, seedSeeker } from '../../../../../../tests/helpers/sp2';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { consume } from '@/modules/ratelimit';
import { GET as getSettings, PATCH as patchSettings } from '../alert-settings/route';
import { DELETE, PATCH } from './[id]/route';
import { GET, POST } from './route';

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
const BASE = `${APP_URL}/api/v1/me`;

let t: TestDb;
let seeker: { id: string; clerkUserId: string };
let other: { id: string; clerkUserId: string };
let host: { clerkUserId: string };

beforeAll(async () => {
  t = await createTestDb();
  state.db = t.db;
});

afterAll(async () => {
  state.db = undefined;
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.saved_searches`);
  await t.db.execute(sql`delete from app.alert_settings`);
  await t.db.execute(sql`delete from app.rate_limits`);
  await t.db.execute(sql`delete from app.settings`);
  const s = await seedSeeker(t.db);
  seeker = { id: s.userId, clerkUserId: s.user.clerkUserId };
  const o = await seedSeeker(t.db);
  other = { id: o.userId, clerkUserId: o.user.clerkUserId };
  host = { clerkUserId: (await seedHostOrg(t.db)).owner.clerkUserId };
  state.clerkUserId = seeker.clerkUserId;
});

type ErrorBody = { error: { code: string; message: string } };
type Item = {
  id: string;
  name: string;
  query: unknown;
  summary: string;
  pushEnabled: boolean;
  emailDaily: boolean;
  createdAt: string;
};

function write(method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', origin: APP_URL },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const list = () => GET(new Request(`${BASE}/saved-searches`));
const create = (body: unknown) => POST(write('POST', `${BASE}/saved-searches`, body));
const patch = (id: string, body: unknown) =>
  PATCH(write('PATCH', `${BASE}/saved-searches/${id}`, body), params(id));
const del = (id: string) => DELETE(write('DELETE', `${BASE}/saved-searches/${id}`), params(id));
const readSettings = () => getSettings(new Request(`${BASE}/alert-settings`));
const writeSettings = (body: unknown) =>
  patchSettings(write('PATCH', `${BASE}/alert-settings`, body));

const SKI = { genres: ['ski-resorts'], states: ['CO'] };

describe('POST /api/v1/me/saved-searches', () => {
  it('answers 201 for a new search and 200 with the same item when it is saved again', async () => {
    const res = await create({ query: SKI });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const item = (await res.json()) as Item;
    expect(item).toMatchObject({
      name: 'Ski resorts · CO',
      summary: 'Ski resorts · CO',
      query: SKI,
      pushEnabled: true,
      emailDaily: true,
    });
    const again = await create({ query: { states: ['CO'], genres: ['ski-resorts'] } });
    expect(again.status).toBe(200);
    expect(((await again.json()) as Item).id).toBe(item.id);
  });

  it('stores a search sent with map bounds without them', async () => {
    const res = await create({ query: { categories: ['farm'], bbox: [-125, 24, -66, 50] } });
    expect(((await res.json()) as Item).query).toEqual({ categories: ['farm'] });
  });

  it('answers 400 for a query outside the bounds or a missing query', async () => {
    expect((await create({ query: { states: ['ZZ'] } })).status).toBe(400);
    expect((await create({ query: { genres: Array(11).fill('ski-resorts') } })).status).toBe(400);
    expect((await create({})).status).toBe(400);
    const empty = await create({ query: SKI, name: '  ' });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as ErrorBody).error.code).toBe('bad_request');
  });

  it('answers 409 at the limit', async () => {
    await t.db.execute(
      sql`insert into app.settings (key, value) values ('discovery.saved_searches_per_user', '1'::jsonb)`,
    );
    expect((await create({ query: SKI })).status).toBe(201);
    const res = await create({ query: { categories: ['farm'] } });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error).toMatchObject({
      code: 'conflict',
      message: 'You can have up to 1 job alert. Remove one to add another.',
    });
  });

  it('answers 429 to the 31st write in an hour', async () => {
    // Start well inside an hour window, so it cannot roll over mid-test.
    const intoWindow = Date.now() % 3_600_000;
    if (intoWindow > 3_585_000) await new Promise((r) => setTimeout(r, 3_600_500 - intoWindow));
    for (let n = 0; n < 29; n++) await consume(t.db, `ss:${seeker.id}`, 30, 3600);
    expect((await create({ query: SKI })).status).toBe(201);
    const res = await create({ query: { categories: ['farm'] } });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    // Reads are not limited.
    expect((await list()).status).toBe(200);
  }, 30_000);
});

describe('GET /api/v1/me/saved-searches', () => {
  it("lists only the seeker's own searches", async () => {
    await create({ query: SKI });
    state.clerkUserId = other.clerkUserId;
    await create({ query: { categories: ['remote'] } });
    state.clerkUserId = seeker.clerkUserId;
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as { items: Item[] };
    expect(body.items.map((i) => i.name)).toEqual(['Ski resorts · CO']);
  });
});

describe('PATCH and DELETE /api/v1/me/saved-searches/:id', () => {
  it('renames and switches a search, then deletes it with 204', async () => {
    const item = (await (await create({ query: SKI })).json()) as Item;
    const res = await patch(item.id, { name: 'Colorado skiing', emailDaily: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: item.id,
      name: 'Colorado skiing',
      pushEnabled: true,
      emailDaily: false,
    });
    const gone = await del(item.id);
    expect(gone.status).toBe(204);
    expect(gone.headers.get('cache-control')).toBe('private, no-store');
    expect(((await (await list()).json()) as { items: Item[] }).items).toEqual([]);
    expect((await del(item.id)).status).toBe(404);
  });

  it("answers 404 for another seeker's search", async () => {
    const item = (await (await create({ query: SKI })).json()) as Item;
    state.clerkUserId = other.clerkUserId;
    expect((await patch(item.id, { pushEnabled: false })).status).toBe(404);
    expect((await del(item.id)).status).toBe(404);
    expect((await patch(newId(), { pushEnabled: false })).status).toBe(404);
    const [row] = await queryRows<{ push: boolean }>(
      t.db,
      sql`select push_enabled as push from app.saved_searches where id = ${item.id}::uuid`,
    );
    expect(row?.push).toBe(true);
  });

  it('answers 400 for a non-boolean switch', async () => {
    const item = (await (await create({ query: SKI })).json()) as Item;
    expect((await patch(item.id, { pushEnabled: 'no' })).status).toBe(400);
  });
});

describe('GET and PATCH /api/v1/me/alert-settings', () => {
  it('reads false until the weekly digest is turned on', async () => {
    const before = await readSettings();
    expect(before.status).toBe(200);
    expect(before.headers.get('cache-control')).toBe('private, no-store');
    expect(await before.json()).toEqual({ weeklyDigest: false });
    const res = await writeSettings({ weeklyDigest: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklyDigest: true });
    expect(await (await readSettings()).json()).toEqual({ weeklyDigest: true });
    expect((await writeSettings({})).status).toBe(400);
  });
});

describe('who can call them', () => {
  it('answers 403 to a host and 401 to a guest', async () => {
    const someId = newId();
    for (const who of [host.clerkUserId, null]) {
      state.clerkUserId = who;
      const expected = who ? 403 : 401;
      expect((await list()).status).toBe(expected);
      expect((await create({ query: SKI })).status).toBe(expected);
      expect((await patch(someId, { pushEnabled: false })).status).toBe(expected);
      expect((await del(someId)).status).toBe(expected);
      expect((await readSettings()).status).toBe(expected);
      expect((await writeSettings({ weeklyDigest: true })).status).toBe(expected);
    }
  });
});
