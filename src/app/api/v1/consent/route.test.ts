// POST /api/v1/consent (SP8 plan Task 26): the cookie, the reused consent id, the rate limit and
// the stored row, which holds no IP address. On PGlite, with the session guard mocked.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import type { CurrentUser } from '@/modules/identity';
import { consentCookieValue } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedSeeker } from '@tests/helpers/sp8';

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!dbHolder.current) throw new Error('test db not ready');
      return dbHolder.current;
    },
  };
});

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock('@/server/guards', async () => {
  const { unauthorized } = await import('@/lib/errors');
  return {
    requireUser: vi.fn(async () => {
      if (!session.user) throw unauthorized('Sign in required');
      return session.user;
    }),
  };
});

type Route = typeof import('./route');
let POST: Route['POST'];
let t: TestDb;
let ips = 0;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  ({ POST } = await import('./route'));
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  session.user = null;
  await t.db.execute(sql`delete from app.consent_records`);
  await t.db.execute(sql`delete from app.rate_limits`);
  ips += 1;
});

function send(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request('http://localhost:3000/api/v1/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-forwarded-for': `203.0.113.${ips}`,
        'x-vercel-ip-country': 'DE',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function rows(): Promise<Record<string, unknown>[]> {
  return queryRows(
    t.db,
    sql`select consent_id, user_id, country, region, analytics, policy_version
        from app.consent_records order by created_at, id`,
  );
}

describe('POST /api/v1/consent', () => {
  it('records the choice and sets the ee_consent cookie for a year', async () => {
    const res = await send({ analytics: true });
    expect(res.status).toBe(200);
    const { consentId } = (await res.json()) as { consentId: string };
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^ee_consent=1\.[0-9a-f-]{36}\.[ar]\.\d+;/);
    expect(cookie).toContain(`ee_consent=1.${consentId}.a.`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=31536000');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(await rows()).toEqual([
      {
        consent_id: consentId,
        user_id: null,
        country: 'DE',
        region: 'eu',
        analytics: true,
        policy_version: 0,
      },
    ]);
  });

  it("reuses a valid cookie's consent id, and links a signed-in person", async () => {
    const { userId, user } = await seedSeeker(t.db);
    session.user = user;
    const consentId = '0190f7a2-0000-7000-8000-00000000c0de';
    const previous = consentCookieValue(consentId, true, new Date());

    const res = await send({ analytics: false }, { cookie: `theme=dark; ee_consent=${previous}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ consentId });
    expect(res.headers.get('set-cookie')).toContain(`ee_consent=1.${consentId}.r.`);
    expect(await rows()).toEqual([
      expect.objectContaining({ consent_id: consentId, user_id: userId, analytics: false }),
    ]);
  });

  it('starts a new consent id for a malformed cookie, and stores a bad country as null', async () => {
    const res = await send(
      { analytics: false },
      { cookie: 'ee_consent=1.nope.a.1', 'x-vercel-ip-country': 'zz1' },
    );
    const { consentId } = (await res.json()) as { consentId: string };
    expect(consentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await rows()).toEqual([
      expect.objectContaining({ consent_id: consentId, country: null, region: 'other' }),
    ]);
  });

  it('records a refusal when the browser sends Global Privacy Control', async () => {
    const res = await send({ analytics: true }, { 'x-vercel-ip-country': 'US', 'sec-gpc': '1' });
    expect(res.headers.get('set-cookie')).toMatch(/^ee_consent=1\.[0-9a-f-]{36}\.r\./);
    expect(await rows()).toEqual([expect.objectContaining({ region: 'other', analytics: false })]);
  });

  it('answers the 31st request in an hour from one address with 429', async () => {
    for (let i = 0; i < 30; i++) expect((await send({ analytics: false })).status).toBe(200);
    const blocked = await send({ analytics: false });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('set-cookie')).toBeNull();
    // Another address is not limited.
    ips += 1;
    expect((await send({ analytics: false })).status).toBe(200);
  });

  it('refuses a body that is not one boolean', async () => {
    expect((await send({ analytics: 'yes' })).status).toBe(400);
    expect((await send({ analytics: true, ip: '203.0.113.1' })).status).toBe(400);
    expect(await rows()).toEqual([]);
  });
});
