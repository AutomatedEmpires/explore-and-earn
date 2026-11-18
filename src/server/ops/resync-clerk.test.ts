import type {
  OrganizationJSON,
  OrganizationMembershipJSON,
  UserJSON,
} from '@clerk/nextjs/server';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { clerkIdHash } from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { resyncClerk, type ClerkLister } from './resync-clerk';

const ms = (iso: string) => new Date(iso).getTime();

// Clerk Backend API objects (snake_case JSON). Only the fields the sync reads are filled in.
function userJson(o: { id: string; email: string; firstName: string; updatedAt: string }): UserJSON {
  return {
    object: 'user',
    id: o.id,
    username: null,
    first_name: o.firstName,
    last_name: 'Rodriguez',
    primary_email_address_id: 'idn_primary',
    email_addresses: [{ object: 'email_address', id: 'idn_primary', email_address: o.email }],
    public_metadata: {},
    private_metadata: {},
    unsafe_metadata: {},
    two_factor_enabled: false,
    created_at: ms('2026-11-01T00:00:00Z'),
    updated_at: ms(o.updatedAt),
  } as unknown as UserJSON;
}

function orgJson(o: { id: string; name: string; createdBy: string; updatedAt: string }): OrganizationJSON {
  return {
    object: 'organization',
    id: o.id,
    name: o.name,
    slug: o.name.toLowerCase().replaceAll(' ', '-'),
    created_by: o.createdBy,
    public_metadata: { created_via: 'app' },
    created_at: ms('2026-11-01T00:00:00Z'),
    updated_at: ms(o.updatedAt),
  } as unknown as OrganizationJSON;
}

function membershipJson(o: {
  id: string;
  org: OrganizationJSON;
  userId: string;
  email: string;
  updatedAt: string;
}): OrganizationMembershipJSON {
  return {
    object: 'organization_membership',
    id: o.id,
    role: 'org:admin',
    permissions: [],
    public_metadata: {},
    organization: o.org,
    public_user_data: {
      user_id: o.userId,
      identifier: o.email,
      first_name: 'Maya',
      last_name: 'Rodriguez',
    },
    created_at: ms('2026-11-01T00:00:00Z'),
    updated_at: ms(o.updatedAt),
  } as unknown as OrganizationMembershipJSON;
}

type FakeClerk = ClerkLister & {
  userList: UserJSON[];
  orgList: OrganizationJSON[];
  membershipsByOrg: Record<string, OrganizationMembershipJSON[]>;
};

function fakeLister(): FakeClerk {
  async function* each<T>(items: readonly T[]): AsyncIterable<T> {
    for (const item of items) yield item;
  }
  const fake: FakeClerk = {
    userList: [],
    orgList: [],
    membershipsByOrg: {},
    users: () => each(fake.userList),
    organizations: () => each(fake.orgList),
    memberships: (clerkOrgId) => each(fake.membershipsByOrg[clerkOrgId] ?? []),
  };
  return fake;
}

/** A fake Clerk with 2 users, 1 organization and 1 membership, under fresh IDs. */
function seedClerk(): { clerk: FakeClerk; maya: string; sam: string; orgId: string } {
  const tag = newId().replaceAll('-', '').slice(-10);
  const maya = `user_maya_${tag}`;
  const sam = `user_sam_${tag}`;
  const orgId = `org_${tag}`;
  const clerk = fakeLister();
  clerk.userList = [
    userJson({ id: maya, email: `maya-${tag}@example.test`, firstName: 'Maya', updatedAt: '2026-11-02T00:00:00Z' }),
    userJson({ id: sam, email: `sam-${tag}@example.test`, firstName: 'Sam', updatedAt: '2026-11-02T00:00:00Z' }),
  ];
  const org = orgJson({ id: orgId, name: `Kettle Ridge ${tag}`, createdBy: maya, updatedAt: '2026-11-02T00:00:00Z' });
  clerk.orgList = [org];
  clerk.membershipsByOrg[orgId] = [
    membershipJson({
      id: `orgmem_${tag}`,
      org,
      userId: maya,
      email: `maya-${tag}@example.test`,
      updatedAt: '2026-11-02T00:00:00Z',
    }),
  ];
  return { clerk, maya, sam, orgId };
}

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.webhook_events`);
});

type State = {
  users: { clerk_user_id: string; email: string | null; display_name: string | null }[];
  orgs: { clerk_org_id: string; name: string }[];
  memberships: { clerk_user_id: string; clerk_org_id: string; role: string }[];
  events: number;
};

async function state(clerkUserIds: string[], clerkOrgId: string): Promise<State> {
  const ids = sql.join(clerkUserIds.map((id) => sql`${id}`), sql`, `);
  const users = await queryRows<State['users'][number]>(
    t.db,
    sql`select clerk_user_id, email, display_name from app.users
        where clerk_user_id in (${ids}) order by clerk_user_id`,
  );
  const orgs = await queryRows<State['orgs'][number]>(
    t.db,
    sql`select clerk_org_id, name from app.organizations where clerk_org_id = ${clerkOrgId}`,
  );
  const memberships = await queryRows<State['memberships'][number]>(
    t.db,
    sql`select u.clerk_user_id, o.clerk_org_id, m.role
        from app.org_memberships m
        join app.users u on u.id = m.user_id
        join app.organizations o on o.id = m.org_id
        where o.clerk_org_id = ${clerkOrgId} and m.deleted_at is null`,
  );
  const [events] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.webhook_events`,
  );
  return { users, orgs, memberships, events: events?.n ?? 0 };
}

describe('resyncClerk', () => {
  it('is a dry run by default: it counts what Clerk holds and changes nothing', async () => {
    const { clerk, maya, sam, orgId } = seedClerk();

    const result = await resyncClerk(t.db, clerk);

    expect(result).toEqual({ users: 2, orgs: 1, memberships: 1, applied: 0, rejected: 0 });
    expect(await state([maya, sam], orgId)).toEqual({ users: [], orgs: [], memberships: [], events: 0 });
  });

  it('with apply, the database matches Clerk, and a second run changes nothing', async () => {
    const { clerk, maya, sam, orgId } = seedClerk();
    const tag = orgId.slice(4);

    const first = await resyncClerk(t.db, clerk, { apply: true });

    expect(first).toEqual({ users: 2, orgs: 1, memberships: 1, applied: 4, rejected: 0 });
    const after = await state([maya, sam], orgId);
    expect(after.users).toEqual([
      { clerk_user_id: maya, email: `maya-${tag}@example.test`, display_name: 'Maya Rodriguez' },
      { clerk_user_id: sam, email: `sam-${tag}@example.test`, display_name: 'Sam Rodriguez' },
    ]);
    expect(after.orgs).toEqual([{ clerk_org_id: orgId, name: `Kettle Ridge ${tag}` }]);
    expect(after.memberships).toEqual([{ clerk_user_id: maya, clerk_org_id: orgId, role: 'owner' }]);
    expect(after.events).toBe(4);

    const second = await resyncClerk(t.db, clerk, { apply: true });

    expect(second).toEqual({ users: 2, orgs: 1, memberships: 1, applied: 0, rejected: 0 });
    expect(await state([maya, sam], orgId)).toEqual(after);
  });

  it('applies an object again once it changes in Clerk', async () => {
    const { clerk, maya, sam, orgId } = seedClerk();
    await resyncClerk(t.db, clerk, { apply: true });
    const tag = orgId.slice(4);
    clerk.userList[1] = userJson({
      id: sam,
      email: `sam-${tag}@example.test`,
      firstName: 'Samuel',
      updatedAt: '2026-11-03T00:00:00Z',
    });

    const result = await resyncClerk(t.db, clerk, { apply: true });

    expect(result.applied).toBe(1);
    const users = (await state([maya, sam], orgId)).users;
    expect(users[1]?.display_name).toBe('Samuel Rodriguez');
  });

  it('never re-creates an erased user (Review Focus 6)', async () => {
    const { clerk, maya, sam, orgId } = seedClerk();
    const erasedId = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, display_name, erased_clerk_id_sha256, deleted_at)
      values (${erasedId}, ${`deleted:${erasedId}`}, 'Deleted user', ${clerkIdHash(sam)}, now())
    `);

    const result = await resyncClerk(t.db, clerk, { apply: true });

    expect(result.users).toBe(2);
    const after = await state([maya, sam], orgId);
    expect(after.users.map((user) => user.clerk_user_id)).toEqual([maya]);
    const [erased] = await queryRows<{ email: string | null; display_name: string }>(
      t.db,
      sql`select email, display_name from app.users where id = ${erasedId}`,
    );
    expect(erased).toEqual({ email: null, display_name: 'Deleted user' });
  });

  it('counts an object the sync refuses for good', async () => {
    const { clerk } = seedClerk();
    clerk.userList = [{ id: `user_bad_${newId()}`, updated_at: 'yesterday' } as unknown as UserJSON];
    clerk.orgList = [];

    const result = await resyncClerk(t.db, clerk, { apply: true });

    expect(result).toEqual({ users: 1, orgs: 0, memberships: 0, applied: 0, rejected: 1 });
  });
});
