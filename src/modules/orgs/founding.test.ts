// The FD-7 founding cohort (./founding.ts): the first 100 host organizations, numbered in signup
// order when the app creates them. Paying, staff joining and Clerk-only organizations play no
// part.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  CREATED_VIA_APP,
  CREATED_VIA_KEY,
  handleClerkEvent,
  makeFakeClerkAdmin,
  setAccountType,
  syncClerkUser,
} from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { createOrganization } from './create';
import {
  FOUNDING_COHORT_SIZE,
  countFoundingCohort,
  getFoundingNumber,
  reserveFoundingNumber,
} from './founding';

let t: TestDb;
let users = 0;
/** One fake Clerk per test, so each signup gets its own Clerk organization id. */
let clerk: ReturnType<typeof makeFakeClerkAdmin>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  clerk = makeFakeClerkAdmin();
  await t.db.execute(
    sql`truncate app.org_memberships, app.organizations, app.operators, app.users,
      app.webhook_events cascade`,
  );
});

const UPDATED_AT = Date.parse('2026-11-01T00:00:00Z');

async function newUser(): Promise<{ id: string; clerk: string }> {
  const clerk = `user_${++users}`;
  const id = await syncClerkUser(t.db, { id: clerk, public_metadata: {}, updated_at: UPDATED_AT });
  await setAccountType(t.db, makeFakeClerkAdmin(), id, { accountType: 'host' });
  return { id, clerk };
}

async function signUp(name = 'Kettle Ridge Lodge') {
  const owner = await newUser();
  return createOrganization(t.db, clerk, { ownerUserId: owner.id, name });
}

/** Organizations that signed up before any of these tests: numbers 1 to `upTo` are taken. */
async function takeNumbers(upTo: number) {
  await t.db.execute(sql`
    insert into app.organizations (id, clerk_org_id, name, slug)
    select gen_random_uuid(), 'org_earlier_' || lpad(n::text, 3, '0'), 'Earlier ' || n,
      'earlier-' || n
    from generate_series(1, ${upTo}) n
  `);
  await t.db.execute(sql`
    insert into app.founding_cohort (founding_number, org_id)
    select row_number() over (order by clerk_org_id), id
    from app.organizations where clerk_org_id like 'org_earlier_%'
  `);
}

describe('the founding cohort', () => {
  it('numbers host organizations in signup order when the app creates them', async () => {
    const first = await signUp('First Lodge');
    const second = await signUp('Second Lodge');
    expect(await getFoundingNumber(t.db, first.id)).toBe(1);
    expect(await getFoundingNumber(t.db, second.id)).toBe(2);
    expect(await countFoundingCohort(t.db)).toBe(2);
  });

  it('gives organization 101 no number, and never one later', async () => {
    await takeNumbers(FOUNDING_COHORT_SIZE - 1);
    const hundredth = await signUp('Hundredth Lodge');
    const late = await signUp('Late Lodge');
    expect(await getFoundingNumber(t.db, hundredth.id)).toBe(100);
    expect(await getFoundingNumber(t.db, late.id)).toBeNull();
    // Even though none of the first 100 has paid, and asking again changes nothing.
    expect(await reserveFoundingNumber(t.db, late.id)).toBeNull();
    expect(await countFoundingCohort(t.db)).toBe(FOUNDING_COHORT_SIZE);
  });

  it('keeps an organization its number on a repeat, and never gives it a second', async () => {
    const org = await signUp();
    expect(await reserveFoundingNumber(t.db, org.id)).toBe(1);
    expect(await countFoundingCohort(t.db)).toBe(1);
  });

  it("doesn't count a staff member joining an existing organization", async () => {
    const org = await signUp();
    const clerkOrgId = (
      await queryRows<{ clerk_org_id: string }>(
        t.db,
        sql`select clerk_org_id from app.organizations where id = ${org.id}`,
      )
    )[0]?.clerk_org_id;
    const staff = await newUser();
    await handleClerkEvent(t.db, {
      id: `msg_${newId()}`,
      type: 'organizationMembership.created',
      data: {
        role: 'org:recruiter',
        organization: { id: clerkOrgId },
        public_user_data: { user_id: staff.clerk },
        updated_at: UPDATED_AT,
      },
    });
    const members = await queryRows(
      t.db,
      sql`select 1 from app.org_memberships where org_id = ${org.id} and deleted_at is null`,
    );
    expect(members).toHaveLength(2);
    expect(await countFoundingCohort(t.db)).toBe(1);
  });

  it('numbers an app-created organization whose Clerk webhook arrives first, once', async () => {
    const owner = await newUser();
    const webhookFirst = makeFakeClerkAdmin({
      onCreateOrganization: async ({ clerkOrgId, name, createdBy }) => {
        await handleClerkEvent(t.db, {
          id: 'msg_org',
          type: 'organization.created',
          data: {
            object: 'organization',
            id: clerkOrgId,
            name,
            created_by: createdBy,
            public_metadata: { [CREATED_VIA_KEY]: CREATED_VIA_APP },
            updated_at: UPDATED_AT,
          },
        });
      },
    });
    const org = await createOrganization(t.db, webhookFirst, {
      ownerUserId: owner.id,
      name: 'Kettle',
    });
    expect(await getFoundingNumber(t.db, org.id)).toBe(1);
    expect(await countFoundingCohort(t.db)).toBe(1);
  });

  it('gives an organization created outside the app no number', async () => {
    const someone = await newUser();
    await handleClerkEvent(t.db, {
      id: 'msg_outside',
      type: 'organization.created',
      data: {
        object: 'organization',
        id: 'org_outside',
        name: 'Made In Clerk',
        created_by: someone.clerk,
        public_metadata: {},
        updated_at: UPDATED_AT,
      },
    });
    const [row] = await queryRows<{ id: string; owner_user_id: string | null }>(
      t.db,
      sql`select id, owner_user_id from app.organizations where clerk_org_id = 'org_outside'`,
    );
    expect(row?.owner_user_id).toBeNull();
    expect(await getFoundingNumber(t.db, row?.id ?? '')).toBeNull();
    expect(await countFoundingCohort(t.db)).toBe(0);
  });

  it("never reissues a number, or frees a spot, when an organization's row is hard-deleted", async () => {
    await signUp('First Lodge');
    const second = await signUp('Second Lodge');
    // The app only soft-deletes; a cleanup outside it may still remove the row.
    await t.db.execute(sql`delete from app.org_memberships where org_id = ${second.id}`);
    await t.db.execute(sql`delete from app.org_slugs where org_id = ${second.id}`);
    await t.db.execute(sql`delete from app.organizations where id = ${second.id}`);

    const kept = await queryRows<{ founding_number: number; org_id: string | null }>(
      t.db,
      sql`select founding_number, org_id from app.founding_cohort where founding_number = 2`,
    );
    expect(kept).toEqual([{ founding_number: 2, org_id: null }]);
    expect(await countFoundingCohort(t.db)).toBe(2);

    const third = await signUp('Third Lodge');
    expect(await getFoundingNumber(t.db, third.id)).toBe(3);
    expect(await countFoundingCohort(t.db)).toBe(3);
  });

  it('rolls back with the signup that failed', async () => {
    const owner = await newUser();
    await t.db
      .transaction(async (tx) => {
        await tx.execute(sql`
          insert into app.organizations (id, clerk_org_id, name, slug, owner_user_id)
          values (${newId()}, 'org_rollback', 'Rollback', 'rollback', ${owner.id})
        `);
        const [org] = await queryRows<{ id: string }>(
          tx,
          sql`select id from app.organizations where clerk_org_id = 'org_rollback'`,
        );
        expect(await reserveFoundingNumber(tx, org?.id ?? '')).toBe(1);
        throw new Error('signup failed');
      })
      .catch(() => {});
    expect(await countFoundingCohort(t.db)).toBe(0);
    const next = await signUp();
    expect(await getFoundingNumber(t.db, next.id)).toBe(1);
  });
});
