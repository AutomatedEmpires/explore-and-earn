// The guards against a real (PGlite) database, with Clerk's session helpers mocked.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Db, queryRows } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { AppError } from '@/lib/errors';
import {
  handleClerkEvent,
  makeFakeClerkAdmin,
  setAccountType,
  syncClerkUser,
} from '@/modules/identity';
import { createOrganization } from '@/modules/orgs';
import { createTestDb, type TestDb } from '../../tests/helpers/db';

type Session = { userId: string | null; orgId?: string | null; reverified?: boolean };
type RawUser = Record<string, unknown>;

const clerk = vi.hoisted(() => ({
  session: { userId: null } as Session,
  users: new Map<string, RawUser>(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({
    userId: clerk.session.userId,
    orgId: clerk.session.orgId ?? null,
    has: (params: { reverification?: unknown }) =>
      params.reverification !== undefined && clerk.session.reverified === true,
  })),
  currentUser: vi.fn(async () => {
    const raw = clerk.session.userId ? clerk.users.get(clerk.session.userId) : undefined;
    return raw ? { id: raw.id, raw } : null;
  }),
}));

const holder = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!holder.db) throw new Error('test db not ready');
    return holder.db;
  },
}));

const { requireHost, requireOperator, requireSeeker, requireUser } = await import('./guards');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  holder.db = t.db;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  clerk.session = { userId: null };
  clerk.users.clear();
  await t.db.execute(
    sql`truncate app.org_memberships, app.organizations, app.operators, app.users, app.webhook_events cascade`,
  );
});

/** A Clerk user as the Backend API returns it, registered with the mocked currentUser(). */
function clerkUser(
  id: string,
  o: { metadata?: Record<string, unknown>; passkey?: boolean; twoStep?: boolean } = {},
): RawUser {
  const raw: RawUser = {
    object: 'user',
    id,
    first_name: 'Maya',
    last_name: 'Rodriguez',
    primary_email_address_id: 'idn_1',
    email_addresses: [{ id: 'idn_1', email_address: `${id}@example.test` }],
    public_metadata: o.metadata ?? {},
    two_factor_enabled: o.twoStep ?? false,
    passkeys: o.passkey
      ? [{ object: 'passkey', id: 'pk_1', name: 'Laptop', verification: { status: 'verified' } }]
      : [],
    updated_at: Date.parse('2026-11-01T00:00:00Z'),
  };
  clerk.users.set(id, raw);
  return raw;
}

async function signIn(raw: RawUser, session: Omit<Session, 'userId'> = {}): Promise<string> {
  clerk.session = { userId: String(raw.id), ...session };
  return syncClerkUser(t.db, raw);
}

async function expectDenied(
  p: Promise<unknown>,
  code: 'unauthorized' | 'forbidden',
  details?: Record<string, unknown>,
) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (details) expect((err as AppError).details).toMatchObject(details);
}

async function clerkOrgIdOf(orgId: string): Promise<string> {
  const [row] = await queryRows<{ clerk_org_id: string }>(
    t.db,
    sql`select clerk_org_id from app.organizations where id = ${orgId}`,
  );
  if (!row) throw new Error(`organization ${orgId} not found`);
  return row.clerk_org_id;
}

async function hostWithOrg(raw: RawUser): Promise<{ userId: string; orgId: string }> {
  const userId = await signIn(raw);
  await setAccountType(t.db, makeFakeClerkAdmin(), userId, { accountType: 'host' });
  const org = await createOrganization(t.db, makeFakeClerkAdmin(), {
    ownerUserId: userId,
    name: 'Kettle Ridge Lodge',
  });
  return { userId, orgId: org.id };
}

describe('requireUser', () => {
  it('rejects a signed-out request with unauthorized', async () => {
    await expectDenied(requireUser(), 'unauthorized');
  });

  it("provisions a signed-in user whose webhook hasn't arrived yet", async () => {
    clerkUser('user_new');
    clerk.session = { userId: 'user_new' };

    const user = await requireUser();

    expect(user).toEqual({
      id: expect.any(String),
      clerkUserId: 'user_new',
      accountType: null,
      email: 'user_new@example.test',
    });
    expect((await requireUser()).id).toBe(user.id);
  });

  it('rejects a deleted user', async () => {
    await signIn(clerkUser('user_1'));
    await handleClerkEvent(t.db, {
      id: 'msg_del',
      type: 'user.deleted',
      data: { id: 'user_1', deleted: true },
    });
    await expectDenied(requireUser(), 'unauthorized');
  });
});

describe('requireSeeker', () => {
  it('returns a seeker', async () => {
    const id = await signIn(clerkUser('user_1'));
    await setAccountType(t.db, makeFakeClerkAdmin(), id, {
      accountType: 'seeker',
      adultAttested: true,
    });
    expect((await requireSeeker()).accountType).toBe('seeker');
  });

  it('sends a user without an account type to onboarding', async () => {
    await signIn(clerkUser('user_1'));
    await expectDenied(requireSeeker(), 'forbidden', {
      reason: 'needs_onboarding',
      redirectTo: '/onboarding',
    });
  });

  it('forbids a host', async () => {
    await hostWithOrg(clerkUser('user_1'));
    await expectDenied(requireSeeker(), 'forbidden', { reason: 'wrong_account_type' });
  });
});

describe('requireHost', () => {
  it('sends an Owner without a passkey or two-step sign-in to /host/security', async () => {
    await hostWithOrg(clerkUser('user_1'));
    await expectDenied(requireHost(), 'forbidden', {
      reason: 'needs_strong_auth',
      redirectTo: '/host/security',
    });
  });

  it.each([{ passkey: true }, { twoStep: true }])('lets an Owner with %o in', async (auth) => {
    const { userId, orgId } = await hostWithOrg(clerkUser('user_1', auth));
    const ctx = await requireHost();
    expect(ctx).toEqual({
      user: expect.objectContaining({ id: userId, accountType: 'host' }),
      orgId,
      role: 'owner',
    });
  });

  it("uses the session's active organization", async () => {
    const owner = await hostWithOrg(clerkUser('user_1', { passkey: true }));
    clerk.session.orgId = await clerkOrgIdOf(owner.orgId);
    expect((await requireHost()).orgId).toBe(owner.orgId);

    clerk.session.orgId = 'org_elsewhere';
    await expectDenied(requireHost(), 'forbidden', { reason: 'not_a_member' });
  });

  it('lets a Recruiter in without strong sign-in, but not onto Owner and Admin pages', async () => {
    const owner = await hostWithOrg(clerkUser('user_owner', { passkey: true }));
    await handleClerkEvent(t.db, {
      id: 'msg_rec',
      type: 'organizationMembership.created',
      data: {
        role: 'org:recruiter',
        organization: { id: await clerkOrgIdOf(owner.orgId) },
        public_user_data: { user_id: 'user_rec' },
        updated_at: Date.parse('2026-11-01T00:00:00Z'),
      },
    });
    const recId = await signIn(clerkUser('user_rec'));
    await setAccountType(t.db, makeFakeClerkAdmin(), recId, { accountType: 'host' });

    expect(await requireHost()).toEqual({
      user: expect.objectContaining({ id: recId }),
      orgId: owner.orgId,
      role: 'recruiter',
    });
    await expectDenied(requireHost({ roles: ['owner', 'admin'] }), 'forbidden', {
      reason: 'role_not_allowed',
    });
  });

  it('forbids a seeker', async () => {
    const id = await signIn(clerkUser('user_1', { passkey: true }));
    await setAccountType(t.db, makeFakeClerkAdmin(), id, {
      accountType: 'seeker',
      adultAttested: true,
    });
    await expectDenied(requireHost(), 'forbidden', { reason: 'wrong_account_type' });
  });

  it('forbids a host with no organization', async () => {
    const id = await signIn(clerkUser('user_1', { passkey: true }));
    await setAccountType(t.db, makeFakeClerkAdmin(), id, { accountType: 'host' });
    await expectDenied(requireHost(), 'forbidden', { reason: 'not_a_member' });
  });
});

describe('requireOperator', () => {
  const operatorUser = (o: { role?: 'owner' | 'operator'; passkey?: boolean } = {}) =>
    clerkUser('user_op', {
      passkey: o.passkey ?? true,
      metadata: { account_type: 'operator', operator_role: o.role ?? 'operator' },
    });

  async function assignQueues(userId: string, queues: string[]) {
    await t.db.execute(
      sql`update app.operators set queues = ${`{${queues.join(',')}}`}::text[] where user_id = ${userId}`,
    );
  }

  it('sends an operator without a passkey to /admin/passkey', async () => {
    await signIn(operatorUser({ passkey: false }));
    await expectDenied(requireOperator(), 'forbidden', {
      reason: 'needs_passkey',
      redirectTo: '/admin/passkey',
    });
  });

  it('lets an operator without a passkey in only when ALLOW_OPERATOR_WITHOUT_PASSKEY=true', async () => {
    vi.stubEnv('ALLOW_OPERATOR_WITHOUT_PASSKEY', 'true');
    resetEnvCache();
    try {
      await signIn(operatorUser({ passkey: false }));
      expect((await requireOperator()).role).toBe('operator');
    } finally {
      vi.unstubAllEnvs();
      resetEnvCache();
    }
  });

  it('allows assigned queues and forbids the rest', async () => {
    const id = await signIn(operatorUser());
    await assignQueues(id, ['moderation']);

    expect(await requireOperator({ queue: 'moderation' })).toEqual({
      user: expect.objectContaining({ id, accountType: 'operator' }),
      role: 'operator',
      queues: ['moderation'],
    });
    await expectDenied(requireOperator({ queue: 'fraud' }), 'forbidden', {
      reason: 'queue_not_assigned',
    });
  });

  it('lets an owner into any queue', async () => {
    await signIn(operatorUser({ role: 'owner' }));
    expect((await requireOperator({ queue: 'child_safety' })).role).toBe('owner');
  });

  it('requires recent reverification for sensitive actions', async () => {
    await signIn(operatorUser());
    await expectDenied(requireOperator({ sensitive: true }), 'forbidden', {
      reason: 'reverification_required',
      reverification: 'strict',
    });

    clerk.session.reverified = true;
    expect((await requireOperator({ sensitive: true })).role).toBe('operator');
  });

  it('forbids a host', async () => {
    await hostWithOrg(clerkUser('user_1', { passkey: true }));
    await expectDenied(requireOperator(), 'forbidden', { reason: 'not_an_operator' });
  });
});
