import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db, type Tx } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeFakeClerkAdmin } from './clerk-admin';
import {
  calendarDateAnywhereOnEarth,
  completeOnboarding,
  isAdultOn,
  isSignupRefusal,
  isSignupRefusedAccount,
  onboardingRequestSchema,
  setAccountType,
} from './onboarding';
import { syncClerkUser } from './sync';

/** A date of birth well past 18, for tests about something else. */
const ADULT_DOB = '1990-04-03';
const SEEKER = { accountType: 'seeker', dateOfBirth: ADULT_DOB } as const;

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

/** Every column of the user's row, as text. */
async function wholeRow(id: string): Promise<Record<string, string | null>> {
  const [row] = await queryRows<{ row: Record<string, string | null> }>(
    t.db,
    sql`select to_jsonb(u) as row from app.users u where id = ${id}`,
  );
  return row?.row ?? {};
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

  it('keeps the birth year it is given with the attestation', async () => {
    const userId = await newUser();
    await setAccountType(t.db, makeFakeClerkAdmin(), userId, {
      accountType: 'seeker',
      adultAttested: true,
      birthYear: 2001,
    });
    expect((await wholeRow(userId)).birth_year).toBe(2001);
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
    expect(onboardingRequestSchema.safeParse(SEEKER).success).toBe(true);
    expect(
      onboardingRequestSchema.safeParse({ accountType: 'seeker', dateOfBirth: '2000-02-29' })
        .success,
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
    // The bare 18+ attestation is weaker evidence (legal review 2.6) and no longer accepted.
    { accountType: 'seeker', adultAttested: true },
    { accountType: 'seeker', adultAttested: false },
    { accountType: 'seeker' },
    { accountType: 'seeker', dateOfBirth: '2001-02-30' },
    { accountType: 'seeker', dateOfBirth: '2001-13-01' },
    { accountType: 'seeker', dateOfBirth: '2001-00-10' },
    { accountType: 'seeker', dateOfBirth: '2001-4-3' },
    { accountType: 'seeker', dateOfBirth: '20010403' },
    { accountType: 'seeker', dateOfBirth: '1899-12-31' },
    { accountType: 'seeker', dateOfBirth: 20010403 },
    { accountType: 'seeker', dateOfBirth: '2001-04-03T00:00:00Z' },
    { accountType: 'host' },
    { accountType: 'host', organizationName: 'K' },
    { accountType: 'host', organizationName: 'K'.repeat(81) },
  ])('rejects %o', (body) => {
    expect(onboardingRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('the age screen (legal review 2.6, P0 item 17)', () => {
  it('reads today as the date where it is earliest (UTC-12), so no one is early anywhere', () => {
    expect(calendarDateAnywhereOnEarth(new Date('2026-11-18T12:00:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 18,
    });
    expect(calendarDateAnywhereOnEarth(new Date('2026-11-18T11:59:59Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 17,
    });
    expect(calendarDateAnywhereOnEarth(new Date('2026-01-01T05:00:00Z'))).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
  });

  it('counts the 18th birthday itself as adult, and the day before as not', () => {
    const today = { year: 2026, month: 11, day: 18 };
    expect(isAdultOn({ year: 2008, month: 11, day: 18 }, today)).toBe(true);
    expect(isAdultOn({ year: 2008, month: 11, day: 19 }, today)).toBe(false);
    expect(isAdultOn({ year: 2008, month: 12, day: 1 }, today)).toBe(false);
    expect(isAdultOn({ year: 2008, month: 10, day: 30 }, today)).toBe(true);
    expect(isAdultOn({ year: 2007, month: 12, day: 31 }, today)).toBe(true);
    expect(isAdultOn({ year: 2009, month: 1, day: 1 }, today)).toBe(false);
  });

  it('makes a 29 February birthday 18 on 1 March in a common year', () => {
    const leapling = { year: 2008, month: 2, day: 29 };
    expect(isAdultOn(leapling, { year: 2026, month: 2, day: 28 })).toBe(false);
    expect(isAdultOn(leapling, { year: 2026, month: 3, day: 1 })).toBe(true);
    expect(isAdultOn(leapling, { year: 2028, month: 2, day: 29 })).toBe(true);
  });

  describe('completeOnboarding at the 18th-birthday boundary', () => {
    const BIRTHDAY = '2008-11-18';
    const onTheDay = new Date('2026-11-18T12:00:00Z');

    it('makes an account on the 18th birthday', async () => {
      const userId = await newUser();
      await expect(
        completeOnboarding(
          t.db,
          makeFakeClerkAdmin(),
          userId,
          { accountType: 'seeker', dateOfBirth: BIRTHDAY },
          { now: onTheDay },
        ),
      ).resolves.toEqual({ redirectTo: '/' });
      expect((await userRow(userId))?.account_type).toBe('seeker');
    });

    it.each([
      ['the day before the 18th birthday', BIRTHDAY, new Date('2026-11-17T12:00:00Z')],
      ['the birthday, before it has begun everywhere', BIRTHDAY, new Date('2026-11-18T11:59:59Z')],
      ['one day short', '2008-11-19', onTheDay],
      ['a child', '2016-06-01', onTheDay],
    ])('refuses %s and keeps only the time of the refusal', async (_name, dateOfBirth, now) => {
      const userId = await newUser();
      const clerk = makeFakeClerkAdmin();

      const err = await completeOnboarding(
        t.db,
        clerk,
        userId,
        { accountType: 'seeker', dateOfBirth },
        { now },
      ).catch((e: unknown) => e);

      expect(isSignupRefusal(err)).toBe(true);
      expect(err).toMatchObject({
        code: 'forbidden',
        message: 'We can’t make you an account',
        details: { reason: 'signup_refused' },
      });
      // No hint at the cut-off: the refusal never mentions an age.
      const { message, details } = err as { message: string; details: unknown };
      expect(`${message} ${JSON.stringify(details)}`).not.toMatch(/\d|\bage\b|adult|old/i);
      const row = await wholeRow(userId);
      expect(row.account_type).toBeNull();
      expect(row.adult_attested_at).toBeNull();
      expect(row.birth_year).toBeNull();
      expect(row.signup_refused_at).not.toBeNull();
      expect(clerk.calls).toEqual([]);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('treats a date after today as a typing mistake (400), not a refusal', async () => {
      const userId = await newUser();
      await expect(
        completeOnboarding(
          t.db,
          makeFakeClerkAdmin(),
          userId,
          { accountType: 'seeker', dateOfBirth: '2026-11-19' },
          { now: onTheDay },
        ),
      ).rejects.toMatchObject({ code: 'bad_request' });
    });
  });

  it('stores only "adult: yes" and the birth year, never the full date', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();

    await completeOnboarding(t.db, clerk, userId, {
      accountType: 'seeker',
      dateOfBirth: '2001-04-03',
    });

    const row = await wholeRow(userId);
    expect(row.account_type).toBe('seeker');
    expect(row.adult_attested_at).not.toBeNull();
    expect(row.birth_year).toBe(2001);
    // Month and day are nowhere: not in the row, the audit event or Clerk's metadata.
    const auditData = audit.record.mock.calls.map((call) => (call as unknown[])[1]);
    const everything = JSON.stringify([row, auditData, clerk.calls]);
    expect(everything).not.toMatch(/2001-04-03|04-03|"month"|"day"/);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { accountType: 'seeker' } }),
    );
    expect(clerk.metadata.get('user_1')).toEqual({ account_type: 'seeker' });
  });
});

// Lead decision 2026-11-18 (explore-and-earn#45): once the product knows an account belongs to
// a minor (legal review 2.6), the refusal holds on the account, not only on the browser session.
describe('an under-age refusal holds on the account', () => {
  const CHILD_DOB = '2016-06-01';
  const NOW = new Date('2026-11-18T12:00:00Z');
  const HOST = { accountType: 'host', organizationName: 'Kettle Ridge Lodge' } as const;

  /** The error a call ends with, or 'no error'. */
  async function outcome(call: Promise<unknown>): Promise<unknown> {
    return call.then(
      () => 'no error',
      (e: unknown) => e,
    );
  }

  async function refuse(userId: string, clerk = makeFakeClerkAdmin()): Promise<void> {
    const err = await outcome(
      completeOnboarding(
        t.db,
        clerk,
        userId,
        { accountType: 'seeker', dateOfBirth: CHILD_DOB },
        { now: NOW },
      ),
    );
    expect(isSignupRefusal(err)).toBe(true);
  }

  /** The database's own message for a failed statement (drizzle keeps it as the cause). */
  async function failure(statement: Promise<unknown>): Promise<string> {
    const err = await outcome(statement);
    if (!(err instanceof Error)) return 'no error';
    return err.cause instanceof Error ? err.cause.message : err.message;
  }

  it('refuses every later try, with an adult date or as a host, and keeps the first time', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    await refuse(userId, clerk);
    const stamped = (await wholeRow(userId)).signup_refused_at;
    expect(stamped).not.toBeNull();

    // There is no cookie at this level: the account alone keeps onboarding closed.
    for (const retry of [
      SEEKER,
      HOST,
      { accountType: 'seeker', dateOfBirth: CHILD_DOB },
    ] as const) {
      const err = await outcome(completeOnboarding(t.db, clerk, userId, retry, { now: NOW }));
      expect(isSignupRefusal(err)).toBe(true);
      expect(err).toMatchObject({ code: 'forbidden', message: 'We can’t make you an account' });
    }

    const row = await wholeRow(userId);
    expect(row.account_type).toBeNull();
    expect(row.signup_refused_at).toBe(stamped);
    expect(await queryRows(t.db, sql`select id from app.organizations`)).toEqual([]);
    // Neither Clerk nor the audit log hears about the refusal or any retry.
    expect(clerk.calls).toEqual([]);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('adds only the time of the refusal to the row, never the date or the year', async () => {
    const userId = await newUser();
    const before = await wholeRow(userId);
    await refuse(userId);
    const row = await wholeRow(userId);

    const changed = Object.keys(row).filter((key) => row[key] !== before[key]);
    expect(changed.sort()).toEqual(['signup_refused_at', 'updated_at']);
    expect(row.birth_year).toBeNull();
    expect(row.adult_attested_at).toBeNull();
    expect(JSON.stringify(row)).not.toContain(CHILD_DOB);
    // The stamp is the database's clock at the refusal, not anything the person typed.
    const [stamp] = await queryRows<{ fresh: boolean }>(
      t.db,
      sql`select signup_refused_at > now() - interval '1 minute' as fresh
          from app.users where id = ${userId}`,
    );
    expect(stamp?.fresh).toBe(true);
  });

  it('closes every other way to an account type, such as accepting a team invitation', async () => {
    const userId = await newUser();
    await refuse(userId);
    const clerk = makeFakeClerkAdmin();
    for (const input of [
      { accountType: 'host' },
      { accountType: 'seeker', adultAttested: true },
    ] as const) {
      expect(isSignupRefusal(await outcome(setAccountType(t.db, clerk, userId, input)))).toBe(true);
    }
    expect((await userRow(userId))?.account_type).toBeNull();
    expect(clerk.calls).toEqual([]);
  });

  it('tells the page whether an account was refused', async () => {
    const refused = await newUser('user_refused');
    const other = await newUser('user_other');
    await refuse(refused);
    expect(await isSignupRefusedAccount(t.db, refused)).toBe(true);
    expect(await isSignupRefusedAccount(t.db, other)).toBe(false);
    expect(await isSignupRefusedAccount(t.db, '00000000-0000-7000-8000-00000000abcd')).toBe(false);
  });

  it('refuses, without stamping it, an account whose type is already set', async () => {
    const userId = await newUser();
    await completeOnboarding(t.db, makeFakeClerkAdmin(), userId, SEEKER);
    await refuse(userId);
    const row = await wholeRow(userId);
    expect(row.account_type).toBe('seeker');
    expect(row.signup_refused_at).toBeNull();
  });

  it('never holds a refusal with the adult confirmation or on a host (drizzle/0103)', async () => {
    const refused = await newUser('user_refused');
    await refuse(refused);
    expect(
      await failure(
        t.db.execute(sql`update app.users set adult_attested_at = now() where id = ${refused}`),
      ),
    ).toMatch(/users_signup_refused_not_adult/);
    expect(
      await failure(
        t.db.execute(sql`update app.users set account_type = 'host' where id = ${refused}`),
      ),
    ).toMatch(/users_signup_refused_not_host/);

    const seeker = await newUser('user_seeker');
    await completeOnboarding(t.db, makeFakeClerkAdmin(), seeker, SEEKER);
    expect(
      await failure(
        t.db.execute(sql`update app.users set signup_refused_at = now() where id = ${seeker}`),
      ),
    ).toMatch(/users_signup_refused_not_adult/);
  });
});

describe('completeOnboarding', () => {
  it('sends a seeker to / and a host to /host with their new organization', async () => {
    const seeker = await newUser('user_s');
    const host = await newUser('user_h');
    const clerk = makeFakeClerkAdmin();

    expect(await completeOnboarding(t.db, clerk, seeker, SEEKER)).toEqual({ redirectTo: '/' });
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

  it('commits an inTx write with the account type, and rolls both back when Clerk fails', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('setPublicMetadata');
    const insert = async (tx: Tx) => {
      await tx.execute(
        sql`insert into app.webhook_events (id, source) values ('evt_onboarding_in_tx', 'test')`,
      );
    };

    await expect(completeOnboarding(t.db, clerk, userId, SEEKER, { inTx: insert })).rejects.toThrow(
      /setPublicMetadata/,
    );
    expect((await userRow(userId))?.account_type).toBeNull();
    expect(
      await queryRows(
        t.db,
        sql`select id from app.webhook_events where id = 'evt_onboarding_in_tx'`,
      ),
    ).toEqual([]);

    await completeOnboarding(t.db, makeFakeClerkAdmin(), userId, SEEKER, { inTx: insert });
    expect((await userRow(userId))?.account_type).toBe('seeker');
    expect(
      await queryRows(
        t.db,
        sql`select id from app.webhook_events where id = 'evt_onboarding_in_tx'`,
      ),
    ).toEqual([{ id: 'evt_onboarding_in_tx' }]);
  });

  it('throws conflict when a seeker tries to become a host', async () => {
    const userId = await newUser();
    const clerk = makeFakeClerkAdmin();
    await completeOnboarding(t.db, clerk, userId, SEEKER);
    await expect(
      completeOnboarding(t.db, clerk, userId, { accountType: 'host', organizationName: 'Lodge' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('POST /api/v1/onboarding', () => {
  type Route = typeof import('@/app/api/v1/onboarding/route');
  let POST: Route['POST'];

  // Loading the route compiles its whole module graph, including SP2 wiring. Under the full
  // suite's parallel load that can outlast a test's 30 s, so it happens here, within the hook
  // timeout.
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

  it('returns 400 for a seeker without a date of birth, even with the old 18+ attestation', async () => {
    expect((await post({ accountType: 'seeker', adultAttested: true })).status).toBe(400);
    expect((await post({ accountType: 'seeker', dateOfBirth: '2001-02-30' })).status).toBe(400);
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
    const body = SEEKER;
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
