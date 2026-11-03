import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  bootstrapOwnerInvite,
  countOperators,
  evaluateHostAccess,
  evaluateOperatorAccess,
  findUserByClerkId,
  getOperator,
} from './access';
import { makeFakeClerkAdmin } from './clerk-admin';
import { syncClerkUser } from './sync';

describe('evaluateHostAccess', () => {
  it('sends an Owner without strong sign-in to set it up', () => {
    expect(evaluateHostAccess({ role: 'owner', strongAuth: false })).toBe('needs_strong_auth');
  });

  it('sends an Admin without strong sign-in to set it up', () => {
    expect(evaluateHostAccess({ role: 'admin', strongAuth: false })).toBe('needs_strong_auth');
  });

  it('lets a Recruiter in without strong sign-in', () => {
    expect(evaluateHostAccess({ role: 'recruiter', strongAuth: false })).toBe('ok');
  });

  it('lets an Owner with strong sign-in in', () => {
    expect(evaluateHostAccess({ role: 'owner', strongAuth: true })).toBe('ok');
  });

  it('forbids a Billing member from an Admin-and-Owner page', () => {
    expect(
      evaluateHostAccess({ role: 'billing', strongAuth: false, required: ['admin', 'owner'] }),
    ).toBe('forbidden');
  });

  it('forbids a non-member', () => {
    expect(evaluateHostAccess({ role: null, strongAuth: true })).toBe('forbidden');
  });

  it('reports forbidden before asking for strong sign-in', () => {
    expect(evaluateHostAccess({ role: 'admin', strongAuth: false, required: ['owner'] })).toBe(
      'forbidden',
    );
  });
});

describe('evaluateOperatorAccess', () => {
  const op = (role: 'owner' | 'operator', queues: string[]) => ({ role, queues });

  it('sends an operator without a passkey to register one', () => {
    expect(evaluateOperatorAccess({ operator: op('operator', []), hasPasskey: false })).toBe(
      'needs_passkey',
    );
  });

  it("forbids a queue the operator isn't assigned to", () => {
    expect(
      evaluateOperatorAccess({
        operator: op('operator', ['moderation']),
        hasPasskey: true,
        queue: 'fraud',
      }),
    ).toBe('forbidden');
  });

  it('lets an operator into an assigned queue', () => {
    expect(
      evaluateOperatorAccess({
        operator: op('operator', ['moderation']),
        hasPasskey: true,
        queue: 'moderation',
      }),
    ).toBe('ok');
  });

  it.each(['moderation', 'fraud', 'child_safety', 'audit_sample'])(
    'lets an owner into any queue (%s)',
    (queue) => {
      expect(evaluateOperatorAccess({ operator: op('owner', []), hasPasskey: true, queue })).toBe(
        'ok',
      );
    },
  );

  it('still requires a passkey from an owner', () => {
    expect(evaluateOperatorAccess({ operator: op('owner', []), hasPasskey: false })).toBe(
      'needs_passkey',
    );
  });

  it('forbids someone who is not an operator', () => {
    expect(evaluateOperatorAccess({ operator: null, hasPasskey: true })).toBe('forbidden');
  });
});

describe('user and operator lookups', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.db.execute(
      sql`truncate app.org_memberships, app.organizations, app.operators, app.users, app.webhook_events cascade`,
    );
  });

  const operatorUser = (clerkUserId: string, role?: 'owner' | 'operator') =>
    syncClerkUser(t.db, {
      id: clerkUserId,
      primary_email_address_id: 'idn_1',
      email_addresses: [{ id: 'idn_1', email_address: `${clerkUserId}@example.test` }],
      public_metadata: { account_type: 'operator', ...(role ? { operator_role: role } : {}) },
      updated_at: Date.parse('2026-11-01T00:00:00Z'),
    });

  it('finds a user by Clerk ID', async () => {
    const id = await operatorUser('user_1');
    expect(await findUserByClerkId(t.db, 'user_1')).toEqual({
      id,
      clerkUserId: 'user_1',
      accountType: 'operator',
      email: 'user_1@example.test',
      deletedAt: null,
    });
    expect(await findUserByClerkId(t.db, 'user_unknown')).toBeNull();
  });

  it("reads an operator's role and queues", async () => {
    const id = await operatorUser('user_1');
    await t.db.execute(
      sql`update app.operators set queues = '{moderation,fraud}' where user_id = ${id}`,
    );
    expect(await getOperator(t.db, id)).toEqual({
      role: 'operator',
      queues: ['moderation', 'fraud'],
      shiftStatus: 'away',
    });
  });

  it('counts operators, leaving out deleted accounts', async () => {
    await operatorUser('user_1', 'owner');
    await operatorUser('user_2');
    await operatorUser('user_3');
    await t.db.execute(sql`update app.users set deleted_at = now() where clerk_user_id = 'user_3'`);

    expect(await countOperators(t.db)).toBe(2);
    expect(await countOperators(t.db, { role: 'owner' })).toBe(1);
    expect(await countOperators(t.db, { role: 'operator' })).toBe(1);
  });

  describe('bootstrapOwnerInvite', () => {
    it('invites the first owner', async () => {
      const clerk = makeFakeClerkAdmin();
      await bootstrapOwnerInvite(t.db, clerk, 'Founder@Example.test ');
      expect(clerk.invitations).toEqual([{ email: 'founder@example.test', role: 'owner' }]);
    });

    it('refuses when an owner already exists', async () => {
      await operatorUser('user_1', 'owner');
      const clerk = makeFakeClerkAdmin();
      await expect(bootstrapOwnerInvite(t.db, clerk, 'second@example.test')).rejects.toMatchObject({
        code: 'conflict',
      });
      expect(clerk.invitations).toEqual([]);
    });

    it('rejects an invalid email address', async () => {
      const clerk = makeFakeClerkAdmin();
      await expect(bootstrapOwnerInvite(t.db, clerk, 'not-an-email')).rejects.toMatchObject({
        code: 'bad_request',
      });
      expect(clerk.invitations).toEqual([]);
    });
  });
});
