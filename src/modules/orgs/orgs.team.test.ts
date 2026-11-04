// Team invitations and seats (SP2 Task 18; spec section 1 row 9, Review Focus 1). Entitlements
// is the W0 fake; everything else (jobs, notifications, audit, identity) is real.
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { CurrentUser } from '@/modules/identity';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { runWorker } from '@/modules/jobs';
import { getEmailProvider, stubOutbox, type Message } from '@/modules/notifications';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import {
  seedHostOrg,
  seedListingRow,
  seedLocation,
  seedMember,
  seedSeeker,
  type SeededOrg,
} from '../../../tests/helpers/sp2';
import {
  acceptInvitation,
  createInvitation,
  getListingAccess,
  jobHandlers,
  listInvitations,
  maskEmail,
  previewInvitation,
  revokeInvitation,
  toClerkRole,
} from './index';

vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  entitlementsFake.reset();
  stubOutbox.length = 0;
  await t.db.execute(
    sql`truncate app.member_assignments, app.org_invitations, app.org_slugs, app.org_memberships,
      app.organizations, app.notifications, app.users, app.outbox cascade`,
  );
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A signed-in user who hasn't chosen an account type yet. */
async function newUser(email: string): Promise<CurrentUser> {
  const id = newId();
  const clerkUserId = `user_${id.replace(/-/g, '').slice(-10)}`;
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name)
    values (${id}, ${clerkUserId}, ${email}, 'Maya Chen')
  `);
  return { id, clerkUserId, accountType: null, email };
}

async function accountTypeOf(userId: string): Promise<string | null> {
  const [row] = await queryRows<{ account_type: string | null }>(
    t.db,
    sql`select account_type from app.users where id = ${userId}`,
  );
  return row?.account_type ?? null;
}

const invitationRows = (orgId: string) =>
  queryRows<{ id: string; email: string; status: string; token_hash: string | null }>(
    t.db,
    sql`select id, email, status, token_hash from app.org_invitations
        where org_id = ${orgId} order by created_at`,
  );

const tokenOf = (m: Pick<Message, 'html'> | undefined) => {
  const token = /\/join\/([A-Za-z0-9_-]+)/.exec(m?.html ?? '')?.[1];
  if (!token) throw new Error('no /join/ link in the message');
  return token;
};

/** Runs the orgs.send_invitation handler for one invitation and returns the token it sent. */
async function send(invitationId: string): Promise<string> {
  const before = stubOutbox.length;
  await jobHandlers['orgs.send_invitation']?.({ invitationId }, { db: t.db, now: new Date() });
  expect(stubOutbox.length).toBe(before + 1);
  return tokenOf(stubOutbox[stubOutbox.length - 1]);
}

async function invite(
  org: SeededOrg,
  email: string,
  role: 'admin' | 'recruiter' | 'billing' = 'recruiter',
  scope?: Parameters<typeof createInvitation>[2]['scope'],
): Promise<{ id: string; token: string }> {
  const inv = await createInvitation(t.db, org.owner.ctx, { email, role, scope });
  return { id: inv.id, token: await send(inv.id) };
}

describe('maskEmail and toClerkRole', () => {
  it('masks the local part', () => {
    expect(maskEmail('maya@kettle.com')).toBe('ma***@kettle.com');
    expect(maskEmail('jo@x.com')).toBe('j***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
    expect(maskEmail('sam@x.com')).toBe('sa***@x.com');
  });

  it('maps roles to Clerk roles', () => {
    expect(toClerkRole('admin')).toBe('org:admin');
    expect(toClerkRole('recruiter')).toBe('org:recruiter');
    expect(toClerkRole('billing')).toBe('org:billing');
  });
});

describe('seat limits', () => {
  it('(row 9) refuses an invitation on a Starter org whose one seat is the Owner', async () => {
    const org = await seedHostOrg(t.db);
    entitlementsFake.setLimit(org.orgId, 'seat', 1);
    await expect(
      createInvitation(t.db, org.owner.ctx, { email: 'maya@kettle.com', role: 'recruiter' }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'seat_limit', limit: 1, used: 1 },
    });
    expect(await invitationRows(org.orgId)).toEqual([]);
  });

  it('counts members and unexpired pending invitations, not expired ones', async () => {
    const org = await seedHostOrg(t.db);
    entitlementsFake.setLimit(org.orgId, 'seat', 5);
    await seedMember(t.db, org.orgId, 'admin');
    await seedMember(t.db, org.orgId, 'recruiter');
    await createInvitation(t.db, org.owner.ctx, { email: 'one@kettle.com', role: 'billing' });
    await t.db.execute(sql`
      insert into app.org_invitations (id, org_id, email, role, expires_at, invited_by)
      values (${newId()}, ${org.orgId}, 'old@kettle.com', 'recruiter',
        now() - interval '1 day', ${org.owner.userId})
    `);

    await createInvitation(t.db, org.owner.ctx, { email: 'two@kettle.com', role: 'recruiter' });
    await expect(
      createInvitation(t.db, org.owner.ctx, { email: 'three@kettle.com', role: 'recruiter' }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'seat_limit', used: 5 } });
  });
});

describe('createInvitation', () => {
  it('stores no token and enqueues only the invitation id', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const inv = await createInvitation(t.db, org.owner.ctx, {
      email: '  Maya@Kettle.com ',
      role: 'recruiter',
    });
    expect(inv).toMatchObject({
      email: 'maya@kettle.com',
      role: 'recruiter',
      scope: { kind: 'all' },
      status: 'pending',
      expired: false,
      invitedBy: org.owner.userId,
    });
    const days = (inv.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    expect(await invitationRows(org.orgId)).toEqual([
      { id: inv.id, email: 'maya@kettle.com', status: 'pending', token_hash: null },
    ]);
    const jobs = await queryRows<{ topic: string; payload: unknown; dedupe_key: string }>(
      t.db,
      sql`select topic, payload, dedupe_key from app.outbox`,
    );
    expect(jobs).toEqual([
      {
        topic: 'orgs.send_invitation',
        payload: { invitationId: inv.id },
        dedupe_key: `invite:${inv.id}`,
      },
    ]);

    const [audit] = await queryRows<{ action: string; subject_id: string }>(
      t.db,
      sql`select action, subject_id from app.audit_events
          where org_id = ${org.orgId} and action = 'orgs.member_invited'`,
    );
    expect(audit).toEqual({ action: 'orgs.member_invited', subject_id: inv.id });
  });

  it('sends the token by email and keeps only its hash', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const inv = await createInvitation(t.db, org.owner.ctx, {
      email: 'maya@kettle.com',
      role: 'recruiter',
    });

    const result = await runWorker(t.db, { handlers: jobHandlers });
    expect(result.processed).toBe(1);

    expect(stubOutbox).toHaveLength(1);
    const message = stubOutbox[0];
    expect(message?.to).toBe('maya@kettle.com');
    expect(message?.subject).toBe('Join Kettle Ridge Lodge on Explore&Earn');
    expect(message?.html).toMatch(/https?:\/\/[^"]+\/join\/[A-Za-z0-9_-]{43}/);
    const token = tokenOf(message);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);

    const [row] = await invitationRows(org.orgId);
    expect(row?.token_hash).toBe(sha256(token));

    // The raw token is in no column of the invitations or the outbox.
    const invitations = await queryRows(t.db, sql`select * from app.org_invitations`);
    const outbox = await queryRows(
      t.db,
      sql`select id, topic, payload::text as payload, dedupe_key, status, last_error
          from app.outbox`,
    );
    expect(JSON.stringify(invitations)).not.toContain(token);
    expect(JSON.stringify(outbox)).not.toContain(token);

    expect(await previewInvitation(t.db, token)).toMatchObject({
      orgId: org.orgId,
      orgName: 'Kettle Ridge Lodge',
      role: 'recruiter',
      emailHint: 'ma***@kettle.com',
    });
    expect(inv.id).toBe(row?.id);
  });

  it('issues a fresh token when a send fails, and only that one works', async () => {
    const org = await seedHostOrg(t.db);
    const inv = await createInvitation(t.db, org.owner.ctx, {
      email: 'maya@kettle.com',
      role: 'recruiter',
    });
    const provider = getEmailProvider();
    const sendSpy = vi
      .spyOn(provider, 'send')
      .mockRejectedValueOnce(new Error('email provider is down'));

    const first = await runWorker(t.db, { handlers: jobHandlers });
    expect(first.retried).toBe(1);
    const failedToken = tokenOf(sendSpy.mock.calls[0]?.[0]);
    const [afterFailure] = await invitationRows(org.orgId);
    expect(afterFailure?.token_hash).toBe(sha256(failedToken));

    const later = new Date(Date.now() + 60 * 60_000);
    const second = await runWorker(t.db, { handlers: jobHandlers, now: later });
    expect(second.processed).toBe(1);
    const token = tokenOf(stubOutbox[stubOutbox.length - 1]);
    expect(token).not.toBe(failedToken);
    const [afterRetry] = await invitationRows(org.orgId);
    expect(afterRetry?.token_hash).toBe(sha256(token));

    const [outboxRow] = await queryRows<{ last_error: string | null }>(
      t.db,
      sql`select last_error from app.outbox where dedupe_key = ${`invite:${inv.id}`}`,
    );
    expect(outboxRow?.last_error ?? '').not.toContain(failedToken);

    const user = await newUser('maya@kettle.com');
    expect(await previewInvitation(t.db, failedToken)).toBeNull();
    await expect(
      acceptInvitation(t.db, makeFakeClerkAdmin(), user, failedToken),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(acceptInvitation(t.db, makeFakeClerkAdmin(), user, token)).resolves.toEqual({
      redirectTo: '/host',
    });
  });

  it('sends nothing for a revoked invitation', async () => {
    const org = await seedHostOrg(t.db);
    const inv = await createInvitation(t.db, org.owner.ctx, {
      email: 'maya@kettle.com',
      role: 'billing',
    });
    await revokeInvitation(t.db, org.owner.ctx, inv.id);

    const result = await runWorker(t.db, { handlers: jobHandlers });
    expect(result.processed).toBe(1);
    expect(stubOutbox).toHaveLength(0);
    const [row] = await invitationRows(org.orgId);
    expect(row).toMatchObject({ status: 'revoked', token_hash: null });

    const [audit] = await queryRows<{ action: string }>(
      t.db,
      sql`select action from app.audit_events
          where org_id = ${org.orgId} and action = 'orgs.invitation_revoked'`,
    );
    expect(audit?.action).toBe('orgs.invitation_revoked');
  });

  it("refuses a live member's email and replaces a pending invitation", async () => {
    const org = await seedHostOrg(t.db);
    await seedMember(t.db, org.orgId, 'admin', { email: 'ada@kettle.com' });
    await expect(
      createInvitation(t.db, org.owner.ctx, { email: 'ADA@kettle.com', role: 'billing' }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'already_member' } });

    const first = await createInvitation(t.db, org.owner.ctx, {
      email: 'maya@kettle.com',
      role: 'billing',
    });
    const second = await createInvitation(t.db, org.owner.ctx, {
      email: 'maya@kettle.com',
      role: 'recruiter',
    });
    const rows = await invitationRows(org.orgId);
    expect(rows.filter((r) => r.status === 'pending').map((r) => r.id)).toEqual([second.id]);
    expect(rows.find((r) => r.id === first.id)?.status).toBe('revoked');
    expect((await listInvitations(t.db, org.orgId)).map((i) => i.id)).toEqual([second.id]);
  });

  it('is for Owners and Admins only', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(
      createInvitation(t.db, recruiter.ctx, { email: 'maya@kettle.com', role: 'recruiter' }),
    ).rejects.toMatchObject({ code: 'forbidden', details: { reason: 'role_not_allowed' } });
  });
});

describe('previewInvitation', () => {
  it('returns null for unknown, revoked and accepted tokens, and shows expired ones', async () => {
    const org = await seedHostOrg(t.db);
    expect(await previewInvitation(t.db, 'nope')).toBeNull();

    const revoked = await invite(org, 'rev@kettle.com');
    await revokeInvitation(t.db, org.owner.ctx, revoked.id);
    expect(await previewInvitation(t.db, revoked.token)).toBeNull();

    const accepted = await invite(org, 'acc@kettle.com');
    await acceptInvitation(
      t.db,
      makeFakeClerkAdmin(),
      await newUser('acc@kettle.com'),
      accepted.token,
    );
    expect(await previewInvitation(t.db, accepted.token)).toBeNull();

    const expired = await invite(org, 'exp@kettle.com');
    await t.db.execute(
      sql`update app.org_invitations set expires_at = now() - interval '1 hour'
          where id = ${expired.id}`,
    );
    const preview = await previewInvitation(t.db, expired.token);
    expect(preview?.expiresAt.getTime()).toBeLessThan(Date.now());
  });
});

describe('acceptInvitation', () => {
  it('(row 9) scopes a Recruiter invited to one location to that location', async () => {
    const org = await seedHostOrg(t.db);
    const l1 = await seedLocation(t.db, { orgId: org.orgId });
    const { token } = await invite(org, 'maya@kettle.com', 'recruiter', {
      kind: 'assigned',
      listingIds: [],
      locationIds: [l1],
    });
    const user = await newUser('maya@kettle.com');
    await acceptInvitation(t.db, makeFakeClerkAdmin(), user, token);

    expect(await getListingAccess(t.db, { user, orgId: org.orgId, role: 'recruiter' })).toEqual({
      all: false,
      listingIds: [],
      locationIds: [l1],
    });
  });

  it('(Review Focus 1) compares emails ignoring case, but a plus-address is another address', async () => {
    const org = await seedHostOrg(t.db);
    const { token } = await invite(org, 'maya@kettle.com');

    const plus = await newUser('maya+1@kettle.com');
    await expect(acceptInvitation(t.db, makeFakeClerkAdmin(), plus, token)).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'email_mismatch' },
    });

    const sameButCased = await newUser('Maya@Kettle.COM');
    await expect(
      acceptInvitation(t.db, makeFakeClerkAdmin(), sameButCased, token),
    ).resolves.toEqual({ redirectTo: '/host' });
  });

  it('refuses a seeker account with the exact message, and an expired invitation', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db, { email: 'maya@kettle.com' });
    const { id, token } = await invite(org, 'maya@kettle.com');
    await expect(
      acceptInvitation(t.db, makeFakeClerkAdmin(), seeker.user, token),
    ).rejects.toMatchObject({
      code: 'conflict',
      message:
        'This email belongs to a seeker account. Ask for an invitation to a different email.',
      details: { reason: 'seeker_account' },
    });

    await t.db.execute(
      sql`update app.org_invitations set expires_at = now() - interval '1 hour' where id = ${id}`,
    );
    const user = await newUser('maya@kettle.com');
    await expect(acceptInvitation(t.db, makeFakeClerkAdmin(), user, token)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'expired' },
    });
  });

  it('leaves the account type unset when a check fails, and sets host on success', async () => {
    const org = await seedHostOrg(t.db);
    entitlementsFake.setLimit(org.orgId, 'seat', 5);
    const clerk = makeFakeClerkAdmin();

    const mismatch = await invite(org, 'maya@kettle.com');
    const other = await newUser('other@kettle.com');
    await expect(acceptInvitation(t.db, clerk, other, mismatch.token)).rejects.toMatchObject({
      details: { reason: 'email_mismatch' },
    });
    expect(await accountTypeOf(other.id)).toBeNull();

    const expired = await invite(org, 'exp@kettle.com');
    await t.db.execute(
      sql`update app.org_invitations set expires_at = now() - interval '1 hour'
          where id = ${expired.id}`,
    );
    const expiredUser = await newUser('exp@kettle.com');
    await expect(acceptInvitation(t.db, clerk, expiredUser, expired.token)).rejects.toMatchObject({
      details: { reason: 'expired' },
    });
    expect(await accountTypeOf(expiredUser.id)).toBeNull();

    // The plan shrank after the invitations went out: the Owner and two pending > 1 seat.
    const over = await invite(org, 'seat@kettle.com');
    entitlementsFake.setLimit(org.orgId, 'seat', 1);
    const seatUser = await newUser('seat@kettle.com');
    await expect(acceptInvitation(t.db, clerk, seatUser, over.token)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'seat_limit' },
    });
    expect(await accountTypeOf(seatUser.id)).toBeNull();
    expect(clerk.calls.filter((c) => c.method === 'setPublicMetadata')).toEqual([]);

    entitlementsFake.setLimit(org.orgId, 'seat', 5);
    const maya = await newUser('maya@kettle.com');
    await acceptInvitation(t.db, clerk, maya, mismatch.token);
    expect(await accountTypeOf(maya.id)).toBe('host');
  });

  it('adds the member, in Clerk too, and tells the Owner', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const { id, token } = await invite(org, 'maya@kettle.com', 'recruiter');
    const user = await newUser('maya@kettle.com');
    const clerk = makeFakeClerkAdmin();

    await expect(acceptInvitation(t.db, clerk, user, token)).resolves.toEqual({
      redirectTo: '/host',
    });

    const memberships = await queryRows<{
      role: string;
      recruiter_scope: string;
      invited_by: string;
    }>(
      t.db,
      sql`select role, recruiter_scope, invited_by from app.org_memberships
          where org_id = ${org.orgId} and user_id = ${user.id} and deleted_at is null`,
    );
    expect(memberships).toEqual([
      { role: 'recruiter', recruiter_scope: 'all', invited_by: org.owner.userId },
    ]);
    expect(clerk.calls.filter((c) => c.method === 'addMembership')).toEqual([
      { method: 'addMembership', args: [org.clerkOrgId, user.clerkUserId, 'org:recruiter'] },
    ]);
    const [invitation] = await queryRows<{ status: string; accepted_user_id: string }>(
      t.db,
      sql`select status, accepted_user_id from app.org_invitations where id = ${id}`,
    );
    expect(invitation).toEqual({ status: 'accepted', accepted_user_id: user.id });

    const joined = await queryRows<{ user_id: string; title: string }>(
      t.db,
      sql`select user_id, title from app.notifications where type = 'orgs.member_joined'`,
    );
    expect(joined.map((n) => n.user_id).sort()).toEqual([org.owner.userId, admin.userId].sort());
    expect(joined[0]?.title).toBe('Maya Chen joined your team');

    const [audit] = await queryRows<{ action: string }>(
      t.db,
      sql`select action from app.audit_events
          where org_id = ${org.orgId} and action = 'orgs.invitation_accepted'`,
    );
    expect(audit?.action).toBe('orgs.invitation_accepted');

    // Accepting again is a no-op that still leads to the host app.
    await expect(acceptInvitation(t.db, clerk, user, token)).resolves.toEqual({
      redirectTo: '/host',
    });
    expect(clerk.calls.filter((c) => c.method === 'addMembership')).toHaveLength(1);
  });

  it('undoes the membership when Clerk fails', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = await seedListingRow(t.db, { orgId: org.orgId });
    const { id, token } = await invite(org, 'maya@kettle.com', 'recruiter', {
      kind: 'assigned',
      listingIds: [listingId],
      locationIds: [],
    });
    const user = await newUser('maya@kettle.com');
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('addMembership');

    await expect(acceptInvitation(t.db, clerk, user, token)).rejects.toMatchObject({
      code: 'internal',
    });
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.org_memberships where org_id = ${org.orgId} and user_id = ${user.id}`,
      ),
    ).toEqual([]);
    expect(await queryRows(t.db, sql`select 1 from app.member_assignments`)).toEqual([]);
    const [invitation] = await queryRows<{ status: string; accepted_user_id: string | null }>(
      t.db,
      sql`select status, accepted_user_id from app.org_invitations where id = ${id}`,
    );
    expect(invitation).toEqual({ status: 'pending', accepted_user_id: null });

    // The invitation still works once Clerk is back.
    await expect(acceptInvitation(t.db, clerk, user, token)).resolves.toEqual({
      redirectTo: '/host',
    });
  });

  it('rejoins a member who was removed before', async () => {
    const org = await seedHostOrg(t.db);
    const former = await seedMember(t.db, org.orgId, 'admin', { email: 'maya@kettle.com' });
    await t.db.execute(
      sql`update app.org_memberships set deleted_at = now() where id = ${former.membershipId}`,
    );
    const { token } = await invite(org, 'maya@kettle.com', 'billing');
    await acceptInvitation(t.db, makeFakeClerkAdmin(), former.ctx.user, token);
    const rows = await queryRows<{ role: string; deleted_at: string | null }>(
      t.db,
      sql`select role, deleted_at from app.org_memberships where id = ${former.membershipId}`,
    );
    expect(rows).toEqual([{ role: 'billing', deleted_at: null }]);
  });
});
