// Who is looking at a discovery surface (SP3 plan Task 3): guests, seekers and other accounts,
// their time zone, and the viewer key used for view dedupe and the placement hook.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getPageViewer, getViewer, hmacKey, privateJson, viewerKeyFor } from './viewer';

const clerk = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: clerk.auth }));

const page = vi.hoisted(() => ({
  headers: new Headers(),
  cookies: new Map<string, string>(),
}));
vi.mock('next/headers', () => ({
  headers: async () => page.headers,
  cookies: async () => ({
    get: (name: string) => {
      const value = page.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!dbHolder.current) throw new Error('test db not ready');
    return dbHolder.current;
  },
}));

let t: TestDb;
const users: Record<'seeker' | 'host' | 'fresh', { id: string; clerkUserId: string }> = {
  seeker: { id: newId(), clerkUserId: 'user_seeker' },
  host: { id: newId(), clerkUserId: 'user_host' },
  fresh: { id: newId(), clerkUserId: 'user_fresh' },
};

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, account_type, adult_attested_at) values
      (${users.seeker.id}, ${users.seeker.clerkUserId}, 'seeker', now()),
      (${users.host.id}, ${users.host.clerkUserId}, 'host', null),
      (${users.fresh.id}, ${users.fresh.clerkUserId}, null, null)
  `);
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(() => {
  clerk.auth.mockReset();
  clerk.auth.mockResolvedValue({ userId: null });
  page.headers = new Headers();
  page.cookies.clear();
});

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${url}`, { headers });

describe('viewerKeyFor', () => {
  const ua = 'Mozilla/5.0 (iPhone) Safari/604.1';

  it('gives guests with the same address and browser the same 43-character key', () => {
    const a = viewerKeyFor({ userId: null, ip: '203.0.113.7', userAgent: ua });
    const b = viewerKeyFor({ userId: null, ip: '203.0.113.7', userAgent: ua });
    expect(a).toBe(b);
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(viewerKeyFor({ userId: null, ip: '203.0.113.7', userAgent: `${ua} x` })).not.toBe(a);
  });

  it('uses "unknown" for a missing part', () => {
    expect(viewerKeyFor({ userId: null, ip: null, userAgent: null })).toBe(
      hmacKey('unknown|unknown'),
    );
  });

  it('is the user id for a signed-in user', () => {
    expect(viewerKeyFor({ userId: 'u-1', ip: '203.0.113.7', userAgent: ua })).toBe('u-1');
  });
});

describe('hmacKey', () => {
  it('is a keyed base64url SHA-256 digest', () => {
    expect(hmacKey('a')).toBe(hmacKey('a'));
    expect(hmacKey('a')).not.toBe(hmacKey('b'));
    expect(hmacKey('a')).toHaveLength(43);
    expect(hmacKey('a')).not.toContain('a|');
  });
});

describe('getViewer', () => {
  it('treats a Clerk failure as a guest', async () => {
    clerk.auth.mockRejectedValue(new Error('clerk is down'));
    const viewer = await getViewer(
      req('/api/v1/discovery/search', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
    );
    expect(viewer).toMatchObject({ userId: null, seekerId: null, accountType: null });
    expect(viewer.viewerKey).toBe(
      viewerKeyFor({ userId: null, ip: '203.0.113.7', userAgent: null }),
    );
  });

  it('is a guest with nobody signed in', async () => {
    const viewer = await getViewer(req('/', { 'x-real-ip': '198.51.100.2', 'user-agent': 'UA' }));
    expect(viewer).toEqual({
      userId: null,
      seekerId: null,
      accountType: null,
      viewerKey: viewerKeyFor({ userId: null, ip: '198.51.100.2', userAgent: 'UA' }),
      tz: 'America/Chicago',
    });
  });

  it('gives a seeker their seeker id', async () => {
    clerk.auth.mockResolvedValue({ userId: users.seeker.clerkUserId });
    expect(await getViewer(req('/'))).toEqual({
      userId: users.seeker.id,
      seekerId: users.seeker.id,
      accountType: 'seeker',
      viewerKey: users.seeker.id,
      tz: 'America/Chicago',
    });
  });

  it('gives a host no seeker id', async () => {
    clerk.auth.mockResolvedValue({ userId: users.host.clerkUserId });
    expect(await getViewer(req('/'))).toMatchObject({
      userId: users.host.id,
      seekerId: null,
      accountType: 'host',
    });
  });

  it('gives a user who has not onboarded no seeker id', async () => {
    clerk.auth.mockResolvedValue({ userId: users.fresh.clerkUserId });
    expect(await getViewer(req('/'))).toMatchObject({
      userId: users.fresh.id,
      seekerId: null,
      accountType: null,
    });
  });

  it('is a guest when the Clerk user has no row yet', async () => {
    clerk.auth.mockResolvedValue({ userId: 'user_not_synced' });
    expect(await getViewer(req('/'))).toMatchObject({ userId: null, seekerId: null });
  });

  it('falls back to America/Chicago for an unknown tz (Review Focus 3)', async () => {
    expect((await getViewer(req('/?tz=Etc/Unknown'))).tz).toBe('America/Chicago');
    expect((await getViewer(req('/', { cookie: 'ee_tz=%%%garbled' }))).tz).toBe('America/Chicago');
  });

  it('reads tz from the param first, then the ee_tz cookie', async () => {
    expect((await getViewer(req('/', { cookie: 'theme=dark; ee_tz=Pacific%2FHonolulu' }))).tz).toBe(
      'Pacific/Honolulu',
    );
    expect((await getViewer(req('/', { cookie: 'ee_tz=Pacific/Honolulu' }))).tz).toBe(
      'Pacific/Honolulu',
    );
    expect(
      (await getViewer(req('/?tz=America%2FDenver', { cookie: 'ee_tz=Pacific/Honolulu' }))).tz,
    ).toBe('America/Denver');
  });
});

describe('getPageViewer', () => {
  it('reads the same through headers() and cookies()', async () => {
    clerk.auth.mockResolvedValue({ userId: users.seeker.clerkUserId });
    page.cookies.set('ee_tz', 'Pacific/Honolulu');
    expect(await getPageViewer()).toEqual({
      userId: users.seeker.id,
      seekerId: users.seeker.id,
      accountType: 'seeker',
      viewerKey: users.seeker.id,
      tz: 'Pacific/Honolulu',
    });
  });

  it('keys a guest by address and browser', async () => {
    page.headers = new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'UA' });
    page.cookies.set('ee_tz', 'Etc/Unknown');
    expect(await getPageViewer()).toEqual({
      userId: null,
      seekerId: null,
      accountType: null,
      viewerKey: viewerKeyFor({ userId: null, ip: '203.0.113.7', userAgent: 'UA' }),
      tz: 'America/Chicago',
    });
  });
});

describe('privateJson', () => {
  it('is never cached by a shared cache', async () => {
    const res = privateJson({ ok: true });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('keeps the given status and headers', () => {
    const res = privateJson({}, { status: 201, headers: { 'x-a': '1' } });
    expect(res.status).toBe(201);
    expect(res.headers.get('x-a')).toBe('1');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
