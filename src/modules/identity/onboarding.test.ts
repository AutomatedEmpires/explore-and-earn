import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeFakeClerkAdmin } from './clerk-admin';
import { completeOnboarding, onboardingRequestSchema, setAccountType } from './onboarding';
import { syncClerkUser } from './sync';

const audit = vi.hoisted(() => ({ record: vi.fn(async () => {}) }));
vi.mock('@/modules/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/audit')>()),
  record: audit.record,
}));

// The route reads the database through getDb(); point it at this file's PGlite.
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

// The route is exercised with the guard mocked, so no Clerk session is needed.
vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(async () => ({
    id: '00000000-0000-7000-8000-000000000001',
    clerkUserId: 'user_route',
    accountType: null,
    email: null,
  })),
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  // createOrganization loads identity's index on first use (orgs/create.ts); pay that here, not
  // inside the first host test on a loaded machine.
  await import('./index');
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  audit.record.mockClear();
  await t.db.execute(
    sql`truncate app.org_memberships, app.organizations, app.operators, app.users, app.webhook_events cascade`,
  );
  await t.db.execute(sql`delete from app.rate_limits`);
});

async function newUser(clerkUserId = 'user_1'): Promise<string> {
  return syncClerkUser(t.db, {
    id: clerkUserId,
    first_name: 'Maya',
    last_name: 'Rodriguez',
    primary_email_address_id: 'idn_1',
    email_addresses: [{ id: 'idn_1', email_address: `${clerkUserId}@example.test` }],
    public_metadata: {},
    updated_at: Date.parse('2026-11-01T00:00:00Z'),
  });
}

async function userRow(id: string) {
  const [row] = await queryRows<{ account_type: string | null; adult_attested_at: string | null }>(
    t.db,
    sql`select account_type, adult_attested_at::text from app.users where id = ${id}`,
  );
  return row;
}

describe('setAccountType', () => {
  it('sets seeker with the 18+ attestation and mirrors it to Clerk', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();

    await setAccountType(t.db, clerk, userId, { accountType: 'seeker', adultAttested: true });

    const row = await userRow(userId);
    expect(row?.account_type).toBe('seeker');
    expect(row?.adult_attested_at).not.toBeNull();
    expect(clerk.calls).toEqual([
      { method: 'setPublicMetadata', args: ['user_1', { account_type: 'seeker' }] },
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorType: 'user',
        actorId: userId,
        action: 'identity.account_type_set',
        subjectType: 'user',
        subjectId: userId,
        data: { accountType: 'seeker' },
      }),
    );
  });

  it('sets host without an attestation', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    await setAccountType(t.db, clerk, userId, { accountType: 'host' });
    expect(await userRow(userId)).toEqual({ account_type: 'host', adult_attested_at: null });
    expect(clerk.metadata.get('user_1')).toEqual({ account_type: 'host' });
  });

  it('rejects a seeker without the 18+ attestation', async () => {
    const userId = await newUser();
    const input = { accountType: 'seeker', adultAttested: false } as const;
    await expect(
      // @ts-expect-error adultAttested must be the literal true
      setAccountType(t.db, makeFakeClerkAdmin(), userId, input),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect((await userRow(userId))?.account_type).toBeNull();
  });

  it('never sets operator', async () => {
    const userId = await newUser();
    const input = { accountType: 'operator' } as const;
    await expect(
      // @ts-expect-error operator accounts exist only by invitation
      setAccountType(t.db, makeFakeClerkAdmin(), userId, input),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect((await userRow(userId))?.account_type).toBeNull();
  });

  it.each([
    [{ accountType: 'seeker', adultAttested: true } as const],
    [{ accountType: 'host' } as const],
  ])('throws conflict on a second call (%o)', async (second) => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    await setAccountType(t.db, clerk, userId, { accountType: 'seeker', adultAttested: true });
    await expect(setAccountType(t.db, clerk, userId, second)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect((await userRow(userId))?.account_type).toBe('seeker');
  });

  it('leaves the account type unset if Clerk fails, so the user can retry', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('setPublicMetadata');
    await expect(setAccountType(t.db, clerk, userId, { accountType: 'host' })).rejects.toThrow();
    expect((await userRow(userId))?.account_type).toBeNull();

    await setAccountType(t.db, clerk, userId, { accountType: 'host' });
    expect((await userRow(userId))?.account_type).toBe('host');
  });

  it('refuses an operator invitee, whose type is already set', async () => {
    const userId = await syncClerkUser(t.db, {
      id: 'user_op',
      public_metadata: { account_type: 'operator' },
      updated_at: Date.parse('2026-11-01T00:00:00Z'),
    });
    await expect(
      setAccountType(t.db, makeFakeClerkAdmin(), userId, { accountType: 'host' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('throws not_found for an unknown user', async () => {
    await expect(
      setAccountType(t.db, makeFakeClerkAdmin(), '00000000-0000-7000-8000-00000000abcd', {
        accountType: 'host',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('onboardingRequestSchema', () => {
  it('accepts the two onboarding shapes', () => {
    expect(
      onboardingRequestSchema.safeParse({ accountType: 'seeker', adultAttested: true }).success,
    ).toBe(true);
    expect(
      onboardingRequestSchema.safeParse({
        accountType: 'host',
        organizationName: 'Kettle Ridge Lodge',
      }).success,
    ).toBe(true);
  });

  it.each([
    { accountType: 'operator' },
    { accountType: 'seeker', adultAttested: false },
    { accountType: 'seeker' },
    { accountType: 'host' },
    { accountType: 'host', organizationName: 'K' },
    { accountType: 'host', organizationName: 'K'.repeat(81) },
  ])('rejects %o', (body) => {
    expect(onboardingRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('completeOnboarding', () => {
  it('sends a seeker to / and a host to /host with their new organization', async () => {
    const seeker = await newUser('user_s');
    const host = await newUser('user_h');
    const clerk = makeFakeClerkAdmin();

    expect(
      await completeOnboarding(t.db, clerk, seeker, { accountType: 'seeker', adultAttested: true }),
    ).toEqual({ redirectTo: '/' });
    expect(
      await completeOnboarding(t.db, clerk, host, {
        accountType: 'host',
        organizationName: 'Kettle Ridge Lodge',
      }),
    ).toEqual({ redirectTo: '/host' });

    const orgs = await queryRows<{ name: string; owner_user_id: string }>(
      t.db,
      sql`select name, owner_user_id from app.organizations`,
    );
    expect(orgs).toEqual([{ name: 'Kettle Ridge Lodge', owner_user_id: host }]);
  });

  it('throws conflict when a host who already has an organization onboards again', async () => {
    const host = await newUser();
    const clerk = makeFakeClerkAdmin();
    const input = { accountType: 'host', organizationName: 'Kettle Ridge Lodge' } as const;
    await completeOnboarding(t.db, clerk, host, input);
    await expect(completeOnboarding(t.db, clerk, host, input)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('lets a host whose organization creation failed finish onboarding', async () => {
    const host = await newUser();
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('createOrganization');
    const input = { accountType: 'host', organizationName: 'Kettle Ridge Lodge' } as const;
    await expect(completeOnboarding(t.db, clerk, host, input)).rejects.toThrow();
    expect((await userRow(host))?.account_type).toBe('host');

    expect(await completeOnboarding(t.db, clerk, host, input)).toEqual({ redirectTo: '/host' });
  });

  it('creates one organization when the host form is submitted twice at once', async () => {
    const host = await newUser();
    await setAccountType(t.db, makeFakeClerkAdmin(), host, { accountType: 'host' });
    const input = { accountType: 'host', organizationName: 'Kettle Ridge Lodge' } as const;

    // The second submit arrives while the first is still waiting on Clerk for the organization.
    let second: Promise<unknown> | undefined;
    const clerk = makeFakeClerkAdmin({
      onCreateOrganization: async () => {
        if (second) return;
        second = completeOnboarding(t.db, clerk, host, input).catch((err: unknown) => err);
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    });

    expect(await completeOnboarding(t.db, clerk, host, input)).toEqual({ redirectTo: '/host' });
    expect(await second).toMatchObject({ code: 'conflict' });
    expect(clerk.organizations).toHaveLength(1);
    const orgs = await queryRows<{ slug: string; owner_user_id: string }>(
      t.db,
      sql`select slug, owner_user_id from app.organizations`,
    );
    expect(orgs).toEqual([{ slug: 'kettle-ridge-lodge', owner_user_id: host }]);
  });

  it('throws conflict when a seeker tries to become a host', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    await completeOnboarding(t.db, clerk, userId, { accountType: 'seeker', adultAttested: true });
    await expect(
      completeOnboarding(t.db, clerk, userId, { accountType: 'host', organizationName: 'Lodge' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('POST /api/v1/onboarding', () => {
  type Route = typeof import('@/app/api/v1/onboarding/route');
  let POST: Route['POST'];

  // Loading the route compiles its whole module graph; under the full suite's parallel load
  // that can outlast a test's 30 s, so it happens here, within the 60 s hook timeout.
  beforeAll(async () => {
    ({ POST } = await import('@/app/api/v1/onboarding/route'));
  });

  const post = async (body: unknown) => {
    return POST(
      new Request('http://localhost:3000/api/v1/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify(body),
      }),
    );
  };

  it('returns 400 for an operator account type', async () => {
    const res = await post({ accountType: 'operator' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; requestId: string } };
    expect(json.error.code).toBe('bad_request');
    expect(json.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('returns 400 for a seeker who has not attested to being 18 or older', async () => {
    const res = await post({ accountType: 'seeker', adultAttested: false });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a body that is not JSON', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/v1/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('allows 5 onboarding attempts per user an hour, then returns 429', async () => {
    const body = { accountType: 'seeker', adultAttested: true };
    // The guard's user is not in the database, so each allowed attempt ends in 404.
    for (let n = 0; n < 5; n++) expect((await post(body)).status).toBe(404);

    const res = await post(body);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('returns 403 for a cross-site request', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/v1/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.test' },
        body: JSON.stringify({ accountType: 'host', organizationName: 'Kettle Ridge Lodge' }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
