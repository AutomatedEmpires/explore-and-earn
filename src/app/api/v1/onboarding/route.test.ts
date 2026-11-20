// POST /api/v1/onboarding returns `returnTo` (C-1 in design audit 1): after onboarding, the
// guest's action is where the API sends them, and a path off this site is never returned. It
// also runs the age screen (legal review 2.6): a refused sign-up closes onboarding for that
// account, and for the rest of the browser session. On PGlite, with the session guard mocked
// and a fake Clerk admin.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  LEGAL_TITLES,
  recordCounselApproval,
  saveLegalDraft,
  scheduleLegal,
  type LegalSlug,
} from '@/modules/content';
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

// A fresh fake Clerk admin per call; a test can make its next call fail.
const clerk = vi.hoisted(() => ({
  failNext: null as 'setPublicMetadata' | 'createOrganization' | null,
}));
vi.mock('@/modules/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/identity')>();
  return {
    ...actual,
    clerkAdmin: () => {
      const fake = actual.makeFakeClerkAdmin();
      if (clerk.failNext) fake.failNext(clerk.failNext);
      clerk.failNext = null;
      return fake;
    },
  };
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
const SEEKER = { accountType: 'seeker', dateOfBirth: '1990-04-03' } as const;
const HOST = { accountType: 'host', organizationName: 'Kettle Ridge Lodge' } as const;
/** A date of birth that is under the cut-off on any day this test can run. */
const CHILD = { accountType: 'seeker', dateOfBirth: `${new Date().getUTCFullYear() - 10}-06-01` };

async function send(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const res = await POST(
    new Request('http://localhost:3000/api/v1/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json(), headers: res.headers };
}

async function post(body: unknown): Promise<{ status: number; json: unknown }> {
  const { status, json } = await send(body);
  return { status, json };
}

async function accountType(): Promise<string | null | undefined> {
  const [row] = await queryRows<{ account_type: string | null }>(
    t.db,
    sql`select account_type from app.users where id = ${session.user?.id ?? ''}`,
  );
  return row?.account_type;
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

describe('POST /api/v1/onboarding: the age screen (legal review 2.6)', () => {
  const REFUSAL = {
    error: {
      code: 'forbidden',
      message: 'We can’t make you an account',
      details: { reason: 'signup_refused' },
    },
  };

  it('refuses an under-age date without hinting at the cut-off, and closes the session', async () => {
    const res = await send(CHILD);

    expect(res.status).toBe(403);
    expect(res.json).toMatchObject(REFUSAL);
    const { message, details } = (res.json as { error: { message: string; details: unknown } })
      .error;
    expect(`${message} ${JSON.stringify(details)}`).not.toMatch(/\d|\bage\b|adult|old/i);
    // A session cookie (no Max-Age or Expires): it ends when the browser closes.
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^ee_signup_refused=1; /);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    expect(await accountType()).toBeNull();
  });

  it('refuses a second try in the same session, with any date or as a host', async () => {
    const cookie = { cookie: 'theme=dark; ee_signup_refused=1' };

    await expect(send(SEEKER, cookie)).resolves.toMatchObject({ status: 403, json: REFUSAL });
    await expect(send(HOST, cookie)).resolves.toMatchObject({ status: 403, json: REFUSAL });
    expect(await accountType()).toBeNull();
  });

  it('lets an adult through when the session has no refusal', async () => {
    await expect(send(SEEKER, { cookie: 'theme=dark' })).resolves.toMatchObject({ status: 200 });
    expect(await accountType()).toBe('seeker');
  });

  it('answers 400, without closing the session, for a date that is not real', async () => {
    const res = await send({ accountType: 'seeker', dateOfBirth: '2001-02-30' });
    expect(res.status).toBe(400);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

// Lead decision 2026-11-18 (explore-and-earn#45): the refusal holds on the account, so a new
// browser, a private window, cleared cookies or a script calling the API cannot get past it.
describe('POST /api/v1/onboarding: a refusal holds on the account', () => {
  const REFUSAL = {
    error: {
      code: 'forbidden',
      message: 'We can’t make you an account',
      details: { reason: 'signup_refused' },
    },
  };

  async function refusedAt(): Promise<string | null | undefined> {
    const [row] = await queryRows<{ refused_at: string | null }>(
      t.db,
      sql`select signup_refused_at::text as refused_at from app.users
          where id = ${session.user?.id ?? ''}`,
    );
    return row?.refused_at;
  }

  it('refuses a retry with an adult date once the cookie is cleared', async () => {
    await expect(send(CHILD)).resolves.toMatchObject({ status: 403, json: REFUSAL });
    const stamped = await refusedAt();
    expect(stamped).not.toBeNull();

    // The same account, signed in again in a private window: other cookies, no refusal cookie.
    const retry = await send(SEEKER, { cookie: 'theme=dark' });
    expect(retry).toMatchObject({ status: 403, json: REFUSAL });
    // The cookie is set again, so this browser's page opens on the refusal as well.
    expect(retry.headers.get('set-cookie')).toMatch(/^ee_signup_refused=1; /);
    expect(await accountType()).toBeNull();
    expect(await refusedAt()).toBe(stamped);
  });

  it('refuses the same account as a host, without the cookie', async () => {
    await send(CHILD);
    await expect(send(HOST, { cookie: 'theme=dark' })).resolves.toMatchObject({
      status: 403,
      json: REFUSAL,
    });
    expect(await accountType()).toBeNull();
    expect(await queryRows(t.db, sql`select id from app.organizations`)).toEqual([]);
  });

  it('refuses a direct API call that sends no cookie at all', async () => {
    await send(CHILD);
    // A script with the session token and no Cookie header.
    for (const body of [SEEKER, HOST, { ...SEEKER, returnTo: JOB }]) {
      await expect(send(body)).resolves.toMatchObject({ status: 403, json: REFUSAL });
    }
    expect(await accountType()).toBeNull();
  });

  it('keeps only the time of the refusal on the account, never the date or the year', async () => {
    await send(CHILD);
    const [row] = await queryRows<{
      birth_year: number | null;
      adult: boolean;
      refused: boolean;
      whole: string;
    }>(
      t.db,
      sql`select birth_year, adult_attested_at is not null as adult,
                 signup_refused_at is not null as refused, to_jsonb(u)::text as whole
          from app.users u where id = ${session.user?.id ?? ''}`,
    );
    expect(row).toMatchObject({ birth_year: null, adult: false, refused: true });
    expect(row?.whole).not.toContain(CHILD.dateOfBirth);
  });

  it('still lets another account through in a browser that never saw a refusal', async () => {
    await send(CHILD);
    const id = await syncClerkUser(t.db, {
      id: 'user_other_adult',
      public_metadata: {},
      updated_at: Date.parse('2026-11-01T00:00:00Z'),
    });
    session.user = { id, clerkUserId: 'user_other_adult', accountType: null, email: null };
    await expect(send(SEEKER)).resolves.toMatchObject({ status: 200 });
    expect(await accountType()).toBe('seeker');
  });
});

// SP8 plan Task 24 (spec 8.5): the documents an account type accepts at onboarding, once
// published, must be accepted at their published version; the acceptances commit with the
// account type. While nothing is published (every test above), nothing is required.
describe('POST /api/v1/onboarding: legal acceptance', () => {
  const operatorId = newId();
  const REFUSAL = {
    error: { code: 'forbidden', details: { reason: 'signup_refused' } },
  };

  async function publish(slug: LegalSlug): Promise<void> {
    const doc = await saveLegalDraft(t.db, {
      slug,
      title: LEGAL_TITLES[slug],
      bodyMd: `The ${slug} text.`,
      summaryOfChanges: '',
      counselQuestions: '',
      material: true,
      submitForCounsel: true,
      operatorId,
    });
    await recordCounselApproval(t.db, { documentId: doc.id, note: 'Counsel signed.', operatorId });
    await scheduleLegal(t.db, { documentId: doc.id, effectiveAt: new Date(), operatorId });
  }

  async function acceptances(): Promise<{ slug: string; version: number }[]> {
    return queryRows(
      t.db,
      sql`select slug, version from app.legal_acceptances
          where user_id = ${session.user?.id ?? ''} order by slug`,
    );
  }

  beforeEach(async () => {
    await t.db.execute(sql`delete from app.legal_documents`);
  });

  afterAll(async () => {
    await t.db.execute(sql`delete from app.legal_documents`);
  });

  it('refuses a seeker who has not accepted a published document, and saves nothing', async () => {
    await publish('community');
    const res = await post(SEEKER);
    expect(res).toMatchObject({
      status: 400,
      json: {
        error: {
          code: 'bad_request',
          message: 'Agree to the terms to continue.',
          details: {
            reason: 'legal_acceptance_required',
            missing: [{ slug: 'community', version: 1 }],
          },
        },
      },
    });
    expect(await accountType()).toBeNull();
    expect(await acceptances()).toEqual([]);

    // An older or unknown version is not an acceptance of the published one.
    await expect(
      post({ ...SEEKER, acceptedLegal: [{ slug: 'community', version: 2 }] }),
    ).resolves.toMatchObject({ status: 400 });
    expect(await accountType()).toBeNull();
  });

  it('records the three seeker acceptances with the account type', async () => {
    for (const slug of ['terms', 'privacy', 'community', 'host-terms'] as const)
      await publish(slug);
    const accepted = [
      { slug: 'terms', version: 1 },
      { slug: 'privacy', version: 1 },
      { slug: 'community', version: 1 },
    ];
    await expect(post({ ...SEEKER, acceptedLegal: accepted })).resolves.toEqual({
      status: 200,
      json: { redirectTo: '/' },
    });
    expect(await accountType()).toBe('seeker');
    expect(await acceptances()).toEqual([
      { slug: 'community', version: 1 },
      { slug: 'privacy', version: 1 },
      { slug: 'terms', version: 1 },
    ]);
  });

  it('records nothing when Clerk fails, so the seeker can try again', async () => {
    for (const slug of ['terms', 'privacy', 'community'] as const) await publish(slug);
    const accepted = [
      { slug: 'terms', version: 1 },
      { slug: 'privacy', version: 1 },
      { slug: 'community', version: 1 },
    ];
    clerk.failNext = 'setPublicMetadata';
    const failed = await post({ ...SEEKER, acceptedLegal: accepted });
    expect(failed.status).toBe(500);
    expect(await accountType()).toBeNull();
    expect(await acceptances()).toEqual([]);

    await expect(post({ ...SEEKER, acceptedLegal: accepted })).resolves.toMatchObject({
      status: 200,
    });
    expect(await acceptances()).toHaveLength(3);
  });

  it('asks a host for the Host Terms once they are published', async () => {
    for (const slug of ['terms', 'privacy', 'host-terms'] as const) await publish(slug);
    const res = await post({
      ...HOST,
      acceptedLegal: [
        { slug: 'terms', version: 1 },
        { slug: 'privacy', version: 1 },
      ],
    });
    expect(res).toMatchObject({
      status: 400,
      json: { error: { details: { missing: [{ slug: 'host-terms', version: 1 }] } } },
    });
    expect(await queryRows(t.db, sql`select id from app.organizations`)).toEqual([]);

    await expect(
      post({
        ...HOST,
        acceptedLegal: [
          { slug: 'terms', version: 1 },
          { slug: 'host-terms', version: 1 },
          { slug: 'privacy', version: 1 },
        ],
      }),
    ).resolves.toEqual({ status: 200, json: { redirectTo: '/host' } });
    expect(await acceptances()).toEqual([
      { slug: 'host-terms', version: 1 },
      { slug: 'privacy', version: 1 },
      { slug: 'terms', version: 1 },
    ]);
  });

  it('keeps the age screen: a refused account gets the refusal, accepted documents or not', async () => {
    for (const slug of ['terms', 'privacy', 'community'] as const) await publish(slug);
    const accepted = [
      { slug: 'terms', version: 1 },
      { slug: 'privacy', version: 1 },
      { slug: 'community', version: 1 },
    ];
    // Under age, with every document accepted: refused, and no acceptance is kept.
    await expect(send({ ...CHILD, acceptedLegal: accepted })).resolves.toMatchObject({
      status: 403,
      json: REFUSAL,
    });
    expect(await acceptances()).toEqual([]);

    // The refusal holds on the account even when the retry accepts nothing.
    await expect(send(SEEKER, { cookie: 'theme=dark' })).resolves.toMatchObject({
      status: 403,
      json: REFUSAL,
    });
    await expect(send(HOST)).resolves.toMatchObject({ status: 403, json: REFUSAL });
    // And for the rest of the browser session, by its cookie.
    await expect(send(SEEKER, { cookie: 'ee_signup_refused=1' })).resolves.toMatchObject({
      status: 403,
      json: REFUSAL,
    });
    expect(await accountType()).toBeNull();
  });
});
