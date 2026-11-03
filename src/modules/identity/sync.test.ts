import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { handleClerkEvent, mapClerkRole } from './sync';

// Clerk webhook payload builders (snake_case JSON, as Clerk sends it). Timestamps are ms.
const ms = (iso: string) => new Date(iso).getTime();

function userJson(o: {
  id: string;
  email: string;
  updatedAt: string;
  firstName?: string;
  publicMetadata?: Record<string, unknown>;
}) {
  return {
    object: 'user',
    id: o.id,
    username: null,
    first_name: o.firstName ?? 'Maya',
    last_name: 'Rodriguez',
    primary_email_address_id: 'idn_primary',
    email_addresses: [
      { object: 'email_address', id: 'idn_other', email_address: 'old-alias@example.test' },
      { object: 'email_address', id: 'idn_primary', email_address: o.email },
    ],
    public_metadata: o.publicMetadata ?? {},
    private_metadata: {},
    unsafe_metadata: {},
    two_factor_enabled: false,
    created_at: ms('2026-11-01T00:00:00Z'),
    updated_at: ms(o.updatedAt),
  };
}

function orgJson(o: { id: string; name: string; createdBy?: string; updatedAt: string }) {
  return {
    object: 'organization',
    id: o.id,
    name: o.name,
    slug: o.name.toLowerCase().replaceAll(' ', '-'),
    created_by: o.createdBy,
    public_metadata: {},
    created_at: ms('2026-11-01T00:00:00Z'),
    updated_at: ms(o.updatedAt),
  };
}

function membershipJson(o: {
  id?: string;
  role: string;
  organization: Record<string, unknown>;
  userId: string;
  updatedAt: string;
}) {
  return {
    object: 'organization_membership',
    id: o.id ?? 'orgmem_1',
    role: o.role,
    permissions: [],
    public_metadata: {},
    organization: o.organization,
    public_user_data: {
      user_id: o.userId,
      identifier: 'maya@example.test',
      first_name: 'Maya',
      last_name: 'Rodriguez',
      image_url: '',
      has_image: false,
    },
    created_at: ms('2026-11-01T00:00:00Z'),
    updated_at: ms(o.updatedAt),
  };
}

type UserRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  display_name: string | null;
  account_type: string | null;
  deleted_at: string | null;
};

describe('handleClerkEvent', () => {
  let t: TestDb;

  // One database per file (creating one takes seconds); each test starts from empty tables.
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

  const users = () =>
    queryRows<UserRow>(
      t.db,
      sql`select id, clerk_user_id, email, display_name, account_type, deleted_at::text
          from app.users order by created_at`,
    );
  const orgs = () =>
    queryRows<{
      id: string;
      clerk_org_id: string;
      name: string;
      slug: string;
      owner_user_id: string | null;
    }>(t.db, sql`select id, clerk_org_id, name, slug, owner_user_id from app.organizations`);
  const memberships = () =>
    queryRows<{ org_id: string; user_id: string; role: string; deleted_at: string | null }>(
      t.db,
      sql`select org_id, user_id, role, deleted_at::text from app.org_memberships`,
    );

  it('applies an event once and reports a redelivery as a duplicate', async () => {
    const evt = {
      id: 'msg_1',
      type: 'user.created',
      data: userJson({
        id: 'user_1',
        email: 'maya@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    };
    expect(await handleClerkEvent(t.db, evt)).toBe('applied');
    expect(await handleClerkEvent(t.db, evt)).toBe('duplicate');

    const rows = await users();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clerk_user_id: 'user_1',
      email: 'maya@example.test',
      display_name: 'Maya Rodriguez',
      account_type: null,
      deleted_at: null,
    });
  });

  it('creates placeholders for a membership that arrives before its organization and user', async () => {
    const result = await handleClerkEvent(t.db, {
      id: 'msg_m1',
      type: 'organizationMembership.created',
      data: membershipJson({
        role: 'org:recruiter',
        organization: { object: 'organization', id: 'org_1' },
        userId: 'user_9',
        updatedAt: '2026-11-01T00:01:00Z',
      }),
    });
    expect(result).toBe('applied');

    const [u] = await users();
    const [o] = await orgs();
    expect(u?.clerk_user_id).toBe('user_9');
    expect(o?.clerk_org_id).toBe('org_1');
    expect(await memberships()).toEqual([
      { org_id: o?.id, user_id: u?.id, role: 'recruiter', deleted_at: null },
    ]);

    await handleClerkEvent(t.db, {
      id: 'msg_o1',
      type: 'organization.created',
      data: orgJson({ id: 'org_1', name: 'Kettle Ridge Lodge', updatedAt: '2026-11-01T00:00:00Z' }),
    });

    const after = await orgs();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: o?.id,
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
    });
    expect(await memberships()).toHaveLength(1);

    // The user's own events later fill in the user placeholder without duplicating it.
    await handleClerkEvent(t.db, {
      id: 'msg_u9',
      type: 'user.created',
      data: userJson({
        id: 'user_9',
        email: 'maya@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    });
    const all = await users();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(u?.id);
  });

  it('keeps the newest data when user.updated arrives before user.created', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_upd',
      type: 'user.updated',
      data: userJson({
        id: 'user_1',
        email: 'new@example.test',
        updatedAt: '2026-11-02T00:00:00Z',
      }),
    });
    await handleClerkEvent(t.db, {
      id: 'msg_crt',
      type: 'user.created',
      data: userJson({
        id: 'user_1',
        email: 'old@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    });

    const rows = await users();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('new@example.test');
  });

  it('creates an operators row for an invited operator', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_op',
      type: 'user.created',
      data: userJson({
        id: 'user_op',
        email: 'owner@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
        publicMetadata: { account_type: 'operator', operator_role: 'owner' },
      }),
    });

    const [u] = await users();
    expect(u?.account_type).toBe('operator');
    const ops = await queryRows<{
      user_id: string;
      role: string;
      queues: string[];
      shift_status: string;
    }>(t.db, sql`select user_id, role, queues, shift_status from app.operators`);
    expect(ops).toEqual([{ user_id: u?.id, role: 'owner', queues: [], shift_status: 'away' }]);
  });

  it("defaults an invited operator's role to operator", async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_op2',
      type: 'user.created',
      data: userJson({
        id: 'user_op2',
        email: 'op@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
        publicMetadata: { account_type: 'operator' },
      }),
    });
    const ops = await queryRows<{ role: string }>(t.db, sql`select role from app.operators`);
    expect(ops).toEqual([{ role: 'operator' }]);
  });

  it('ignores a seeker or host account type in metadata (onboarding sets those)', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_s',
      type: 'user.created',
      data: userJson({
        id: 'user_s',
        email: 's@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
        publicMetadata: { account_type: 'seeker' },
      }),
    });
    const [u] = await users();
    expect(u?.account_type).toBeNull();
  });

  it('soft-deletes a user, and a late user.updated does not bring them back', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_a',
      type: 'user.created',
      data: userJson({ id: 'user_1', email: 'a@example.test', updatedAt: '2026-11-01T00:00:00Z' }),
    });
    await handleClerkEvent(t.db, {
      id: 'msg_b',
      type: 'user.deleted',
      data: { object: 'user', id: 'user_1', deleted: true },
    });
    await handleClerkEvent(t.db, {
      id: 'msg_c',
      type: 'user.updated',
      data: userJson({ id: 'user_1', email: 'b@example.test', updatedAt: '2026-11-02T00:00:00Z' }),
    });

    const rows = await users();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).not.toBeNull();
  });

  it('records a deletion that arrives before the user was ever seen', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_d',
      type: 'user.deleted',
      data: { object: 'user', id: 'user_ghost', deleted: true },
    });
    await handleClerkEvent(t.db, {
      id: 'msg_e',
      type: 'user.created',
      data: userJson({
        id: 'user_ghost',
        email: 'g@example.test',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    });
    const rows = await users();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).not.toBeNull();
  });

  it("makes the organization's creator its owner whichever event arrives first", async () => {
    // The creator's membership (Clerk role org:admin) arrives before the organization.
    await handleClerkEvent(t.db, {
      id: 'msg_m',
      type: 'organizationMembership.created',
      data: membershipJson({
        role: 'org:admin',
        organization: { object: 'organization', id: 'org_1' },
        userId: 'user_1',
        updatedAt: '2026-11-01T00:00:01Z',
      }),
    });
    expect((await memberships())[0]?.role).toBe('admin');

    await handleClerkEvent(t.db, {
      id: 'msg_o',
      type: 'organization.created',
      data: orgJson({
        id: 'org_1',
        name: 'Kettle Ridge Lodge',
        createdBy: 'user_1',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    });

    const [o] = await orgs();
    const [u] = await users();
    expect(o?.owner_user_id).toBe(u?.id);
    expect((await memberships())[0]?.role).toBe('owner');

    // A second admin stays an admin.
    await handleClerkEvent(t.db, {
      id: 'msg_m2',
      type: 'organizationMembership.created',
      data: membershipJson({
        id: 'orgmem_2',
        role: 'org:admin',
        organization: orgJson({
          id: 'org_1',
          name: 'Kettle Ridge Lodge',
          createdBy: 'user_1',
          updatedAt: '2026-11-01T00:00:00Z',
        }),
        userId: 'user_2',
        updatedAt: '2026-11-01T00:00:02Z',
      }),
    });
    const roles = (await memberships()).map((m) => m.role).sort();
    expect(roles).toEqual(['admin', 'owner']);
  });

  it('applies membership updates by version and keeps a removal when events are reordered', async () => {
    const org = { object: 'organization', id: 'org_1', name: 'Kettle Ridge Lodge' };
    // Arrival order: deleted, updated, created. Real order: created, updated, deleted.
    await handleClerkEvent(t.db, {
      id: 'msg_del',
      type: 'organizationMembership.deleted',
      data: membershipJson({
        role: 'org:billing',
        organization: org,
        userId: 'user_1',
        updatedAt: '2026-11-01T00:02:00Z',
      }),
    });
    await handleClerkEvent(t.db, {
      id: 'msg_upd',
      type: 'organizationMembership.updated',
      data: membershipJson({
        role: 'org:billing',
        organization: org,
        userId: 'user_1',
        updatedAt: '2026-11-01T00:02:00Z',
      }),
    });
    await handleClerkEvent(t.db, {
      id: 'msg_crt',
      type: 'organizationMembership.created',
      data: membershipJson({
        role: 'org:recruiter',
        organization: org,
        userId: 'user_1',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    });

    const rows = await memberships();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).not.toBeNull();

    // Rejoining later (a newer membership) restores access with the new role.
    await handleClerkEvent(t.db, {
      id: 'msg_rejoin',
      type: 'organizationMembership.created',
      data: membershipJson({
        id: 'orgmem_9',
        role: 'org:recruiter',
        organization: org,
        userId: 'user_1',
        updatedAt: '2026-11-03T00:00:00Z',
      }),
    });
    expect(await memberships()).toEqual([
      expect.objectContaining({ role: 'recruiter', deleted_at: null }),
    ]);
  });

  it('soft-deletes an organization and ignores an older update that arrives later', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_1',
      type: 'organization.created',
      data: orgJson({ id: 'org_1', name: 'Kettle Ridge Lodge', updatedAt: '2026-11-01T00:00:00Z' }),
    });
    await handleClerkEvent(t.db, {
      id: 'msg_2',
      type: 'organization.deleted',
      data: { object: 'organization', id: 'org_1', deleted: true },
    });
    await handleClerkEvent(t.db, {
      id: 'msg_3',
      type: 'organization.updated',
      data: orgJson({ id: 'org_1', name: 'Renamed Lodge', updatedAt: '2026-11-01T12:00:00Z' }),
    });

    const rows = await queryRows<{ name: string; deleted_at: string | null }>(
      t.db,
      sql`select name, deleted_at::text from app.organizations`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).not.toBeNull();
  });

  it('gives organizations with the same name distinct slugs', async () => {
    await handleClerkEvent(t.db, {
      id: 'msg_1',
      type: 'organization.created',
      data: orgJson({ id: 'org_1', name: 'Kettle Ridge Lodge', updatedAt: '2026-11-01T00:00:00Z' }),
    });
    await handleClerkEvent(t.db, {
      id: 'msg_2',
      type: 'organization.created',
      data: orgJson({ id: 'org_2', name: 'Kettle Ridge Lodge', updatedAt: '2026-11-01T00:00:00Z' }),
    });
    const slugs = (await orgs()).map((o) => o.slug).sort();
    expect(slugs).toEqual(['kettle-ridge-lodge', 'kettle-ridge-lodge-2']);
  });

  it('rolls back a failing event so a redelivery can apply it later', async () => {
    const evt = {
      id: 'msg_bad',
      type: 'organizationMembership.created',
      data: membershipJson({
        role: 'org:member',
        organization: { object: 'organization', id: 'org_1' },
        userId: 'user_1',
        updatedAt: '2026-11-01T00:00:00Z',
      }),
    };
    await expect(handleClerkEvent(t.db, evt)).rejects.toMatchObject({ code: 'bad_request' });

    expect(await users()).toHaveLength(0);
    expect(await orgs()).toHaveLength(0);
    const seen = await queryRows(t.db, sql`select id from app.webhook_events`);
    expect(seen).toHaveLength(0);
  });

  it('rejects a payload that does not match the event type', async () => {
    await expect(
      handleClerkEvent(t.db, { id: 'msg_x', type: 'user.created', data: { id: 42 } }),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('records and skips event types it does not handle', async () => {
    expect(
      await handleClerkEvent(t.db, {
        id: 'msg_s',
        type: 'session.created',
        data: { id: 'sess_1' },
      }),
    ).toBe('applied');
    expect(
      await handleClerkEvent(t.db, {
        id: 'msg_s',
        type: 'session.created',
        data: { id: 'sess_1' },
      }),
    ).toBe('duplicate');
  });
});

describe('mapClerkRole', () => {
  it('maps Clerk roles to our organization roles', () => {
    expect(mapClerkRole('org:admin', true)).toBe('owner');
    expect(mapClerkRole('org:admin', false)).toBe('admin');
    expect(mapClerkRole('org:recruiter', false)).toBe('recruiter');
    expect(mapClerkRole('org:billing', false)).toBe('billing');
    expect(mapClerkRole('org:recruiter', true)).toBe('recruiter');
  });

  it('rejects an unknown role with bad_request', () => {
    let caught: unknown;
    try {
      mapClerkRole('org:member', false);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe('bad_request');
  });
});
