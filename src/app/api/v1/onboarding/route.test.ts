// POST /api/v1/onboarding returns `returnTo` (C-1 in design audit 1): after onboarding, the
// guest's action is where the API sends them, and a path off this site is never returned. On
// PGlite, with the session guard mocked and a fake Clerk admin.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { syncClerkUser, type CurrentUser } from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../../../tests/helpers/db';

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
vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(async () => {
    if (!session.user) throw new Error('no user');
    return session.user;
  }),
}));

vi.mock('@/modules/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/identity')>();
  return { ...actual, clerkAdmin: () => actual.makeFakeClerkAdmin() };
});

type Route = typeof import('./route');
let POST: Route['POST'];
let t: TestDb;
let users = 0;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  // Loading the route compiles its whole module graph; do it within the hook timeout.
  ({ POST } = await import('./route'));
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(
    sql`truncate app.org_memberships, app.organizations, app.operators, app.users, app.webhook_events cascade`,
  );
  await t.db.execute(sql`delete from app.rate_limits`);
  // A brand-new account, with no account type yet.
  users += 1;
  const clerkUserId = `user_return_${users}`;
  const id = await syncClerkUser(t.db, {
    id: clerkUserId,
    first_name: 'Maya',
    last_name: 'Rodriguez',
    primary_email_address_id: 'idn_1',
    email_addresses: [{ id: 'idn_1', email_address: `${clerkUserId}@example.test` }],
    public_metadata: {},
    updated_at: Date.parse('2026-11-01T00:00:00Z'),
  });
  session.user = { id, clerkUserId, accountType: null, email: `${clerkUserId}@example.test` };
});

const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';
const SEEKER = { accountType: 'seeker', adultAttested: true } as const;
const HOST = { accountType: 'host', organizationName: 'Kettle Ridge Lodge' } as const;

async function post(body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await POST(
    new Request('http://localhost:3000/api/v1/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe('POST /api/v1/onboarding with returnTo', () => {
  it("returns a seeker to the guest's action", async () => {
    await expect(post({ ...SEEKER, returnTo: JOB })).resolves.toEqual({
      status: 200,
      json: { redirectTo: JOB },
    });
  });

  it('returns a seeker to Apply', async () => {
    const apply = '/apply/019a4a3c-0000-7000-8000-00000000a001?source=feed';
    await expect(post({ ...SEEKER, returnTo: apply })).resolves.toMatchObject({
      json: { redirectTo: apply },
    });
  });

  it('still sends a seeker to Seek without returnTo', async () => {
    await expect(post(SEEKER)).resolves.toEqual({ status: 200, json: { redirectTo: '/' } });
  });

  it('still sends a host to host Home without returnTo', async () => {
    await expect(post(HOST)).resolves.toEqual({ status: 200, json: { redirectTo: '/host' } });
  });

  it('returns a host to a host path', async () => {
    await expect(post({ ...HOST, returnTo: '/host/billing?plan=professional' })).resolves.toEqual({
      status: 200,
      json: { redirectTo: '/host/billing?plan=professional' },
    });
  });

  it.each([
    ['another origin', 'https://evil.test/jobs/view/1'],
    ['protocol-relative', '//evil.test/jobs/view/1'],
    ['a backslash', '/\\evil.test'],
    ['javascript:', 'javascript:alert(1)'],
    ['onboarding itself', '/onboarding?returnTo=%2Fprofile'],
  ])('ignores a returnTo to %s', async (_name, returnTo) => {
    await expect(post({ ...SEEKER, returnTo })).resolves.toEqual({
      status: 200,
      json: { redirectTo: '/' },
    });
  });

  it('never sends a seeker into the host shell', async () => {
    await expect(post({ ...SEEKER, returnTo: '/host/billing' })).resolves.toMatchObject({
      json: { redirectTo: '/' },
    });
  });

  it('refuses a returnTo longer than a return path can be (512 characters)', async () => {
    const res = await post({ ...SEEKER, returnTo: `/${'a'.repeat(512)}` });
    expect(res.status).toBe(400);
    // Refused before anything is saved, so the user can simply try again.
    const [row] = await queryRows<{ account_type: string | null }>(
      t.db,
      sql`select account_type from app.users where id = ${session.user?.id ?? ''}`,
    );
    expect(row?.account_type).toBeNull();
  });

  it('refuses a returnTo that is not a string', async () => {
    await expect(post({ ...SEEKER, returnTo: 42 })).resolves.toMatchObject({ status: 400 });
  });
});
