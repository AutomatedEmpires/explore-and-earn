// drizzle/1000_orgs.sql: organization columns, member assignments and the slug history.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { makeFakeClerkAdmin, setAccountType, syncClerkUser } from '@/modules/identity';
import { createOrganization } from '@/modules/orgs';
import { createTestDb, type TestDb } from '../helpers/db';

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate app.member_assignments, app.org_invitations, app.org_slugs, app.org_memberships,
      app.organizations, app.users cascade`,
  );
});

/** The messages of a rejected query and its causes (Drizzle wraps the driver's error). */
async function dbError(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const messages: string[] = [];
  for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
  return messages.join('\n');
}

async function insertOrg(slug: string, extra = sql``): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.organizations (id, clerk_org_id, name, slug)
    values (${id}, ${`org_${id}`}, ${slug}, ${slug}) ${extra}
  `);
  return id;
}

const slugRows = () =>
  queryRows<{ slug: string; org_id: string; retired: boolean }>(
    db,
    sql`select slug, org_id, retired_at is not null as retired from app.org_slugs order by slug`,
  );

const rename = (orgId: string, slug: string) =>
  db.execute(sql`update app.organizations set slug = ${slug} where id = ${orgId}`);

describe('organizations', () => {
  it('requires an https website', async () => {
    const id = newId();
    const message = await dbError(
      db.execute(sql`
        insert into app.organizations (id, clerk_org_id, name, slug, website_url)
        values (${id}, ${id}, 'X', ${id}, 'http://x.com')
      `),
    );
    expect(message).toMatch(/organizations_website_url_check/);
  });

  it('defaults status, approval rule and verification', async () => {
    const id = await insertOrg('kettle');
    const [row] = await queryRows<Record<string, unknown>>(
      db,
      sql`select status, require_recruiter_approval, verification_status, verified_at,
        primary_location_id from app.organizations where id = ${id}`,
    );
    expect(row).toEqual({
      status: 'active',
      require_recruiter_approval: false,
      verification_status: 'unverified',
      verified_at: null,
      primary_location_id: null,
    });
  });
});

describe('org_slugs', () => {
  it('records a new organization slug', async () => {
    const id = await insertOrg('kettle-ridge-lodge');
    expect(await slugRows()).toEqual([{ slug: 'kettle-ridge-lodge', org_id: id, retired: false }]);
  });

  it('retires the old slug on a rename, and revives it on a rename back', async () => {
    const id = await insertOrg('kettle-ridge-lodge');
    await rename(id, 'kettle-ridge');
    expect(await slugRows()).toEqual([
      { slug: 'kettle-ridge', org_id: id, retired: false },
      { slug: 'kettle-ridge-lodge', org_id: id, retired: true },
    ]);

    await rename(id, 'kettle-ridge-lodge');
    expect(await slugRows()).toEqual([
      { slug: 'kettle-ridge', org_id: id, retired: true },
      { slug: 'kettle-ridge-lodge', org_id: id, retired: false },
    ]);
  });

  it("never hands another organization's retired slug out again", async () => {
    const a = await insertOrg('kettle-ridge-lodge');
    await rename(a, 'kettle-ridge');

    const clerkUserId = `user_${newId()}`;
    const owner = await syncClerkUser(db, {
      id: clerkUserId,
      public_metadata: {},
      updated_at: Date.parse('2026-11-01T00:00:00Z'),
    });
    await setAccountType(db, makeFakeClerkAdmin(), owner, { accountType: 'host' });
    const org = await createOrganization(db, makeFakeClerkAdmin(), {
      ownerUserId: owner,
      name: 'Kettle Ridge Lodge',
    });

    expect(org.slug).toBe('kettle-ridge-lodge-2');
    const rows = await slugRows();
    expect(rows.find((r) => r.slug === 'kettle-ridge-lodge')).toEqual({
      slug: 'kettle-ridge-lodge',
      org_id: a,
      retired: true,
    });
  });
});

describe('member_assignments', () => {
  it('holds exactly one of a listing and a location', async () => {
    const orgId = await insertOrg('kettle');
    const userId = newId();
    await db.execute(sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`);
    const membershipId = newId();
    await db.execute(sql`
      insert into app.org_memberships (id, org_id, user_id, role, recruiter_scope)
      values (${membershipId}, ${orgId}, ${userId}, 'recruiter', 'assigned')
    `);

    const both = await dbError(
      db.execute(sql`
        insert into app.member_assignments (id, membership_id, listing_id, location_id)
        values (${newId()}, ${membershipId}, ${newId()}, ${newId()})
      `),
    );
    expect(both).toMatch(/member_assignments_one_target/);
    const neither = await dbError(
      db.execute(sql`
        insert into app.member_assignments (id, membership_id) values (${newId()}, ${membershipId})
      `),
    );
    expect(neither).toMatch(/member_assignments_one_target/);

    await db.execute(sql`
      insert into app.member_assignments (id, membership_id, location_id)
      values (${newId()}, ${membershipId}, ${newId()})
    `);
  });
});
