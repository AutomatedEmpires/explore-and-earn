// drizzle/1060_orgs_founding_cohort.sql and drizzle/1510_billing_founding_offer.sql (FD-7): the
// backfill of organizations that signed up first, and what the tables refuse on their own.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runMigrations } from '@/lib/migrate';
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
  await db.execute(sql`truncate app.org_memberships, app.organizations, app.users cascade`);
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

async function owner(): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${id}@host.test`}, 'Host', 'host')
  `);
  return id;
}

async function org(o: { ownerId?: string | null; createdAt?: string } = {}): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.organizations (id, clerk_org_id, name, slug, owner_user_id, created_at)
    values (${id}, ${`org_${id}`}, 'Org', ${`org-${id}`}, ${o.ownerId ?? null},
      ${o.createdAt ?? '2026-11-01T00:00:00Z'})
  `);
  return id;
}

const cohort = () =>
  queryRows<{ founding_number: number; org_id: string }>(
    db,
    sql`select founding_number, org_id from app.founding_cohort order by founding_number`,
  );

describe('1060_orgs_founding_cohort', () => {
  it('numbers the host organizations that already signed up, oldest first, up to 100', async () => {
    const host = await owner();
    const second = await org({ ownerId: host, createdAt: '2026-11-02T00:00:00Z' });
    const first = await org({ ownerId: host, createdAt: '2026-11-01T00:00:00Z' });
    // Created outside the app: no Owner, so it never signed up as a host.
    await org({ ownerId: null, createdAt: '2026-10-01T00:00:00Z' });
    await db.execute(sql`
      insert into app.organizations (id, clerk_org_id, name, slug, owner_user_id, created_at)
      select gen_random_uuid(), 'org_more_' || n, 'More', 'more-' || n, ${host},
        timestamptz '2026-11-03T00:00:00Z' + n * interval '1 minute'
      from generate_series(1, 120) n
    `);

    // Run the migration again, as on a database that had these organizations before it.
    await db.execute(sql`drop table app.founding_cohort`);
    await db.execute(
      sql`delete from app.schema_migrations where name = '1060_orgs_founding_cohort.sql'`,
    );
    expect(await runMigrations(db)).toEqual(['1060_orgs_founding_cohort.sql']);

    const rows = await cohort();
    expect(rows).toHaveLength(100);
    expect(rows.slice(0, 2)).toEqual([
      { founding_number: 1, org_id: first },
      { founding_number: 2, org_id: second },
    ]);
    expect(rows.at(-1)?.founding_number).toBe(100);
  });

  it('refuses number 101, a second number for one organization, and a shared number', async () => {
    const a = await org();
    const b = await org();
    expect(
      await dbError(
        db.execute(sql`insert into app.founding_cohort (founding_number, org_id) values (101, ${a})`),
      ),
    ).toMatch(/founding_cohort_founding_number_check/);
    await db.execute(sql`insert into app.founding_cohort (founding_number, org_id) values (1, ${a})`);
    expect(
      await dbError(
        db.execute(sql`insert into app.founding_cohort (founding_number, org_id) values (2, ${a})`),
      ),
    ).toMatch(/founding_cohort_org_id_key/);
    expect(
      await dbError(
        db.execute(sql`insert into app.founding_cohort (founding_number, org_id) values (1, ${b})`),
      ),
    ).toMatch(/founding_cohort_pkey/);
  });
});

describe('1510_billing_founding_offer', () => {
  const insert = (
    orgId: string,
    o: { shape?: string; coupon?: string; endsAt?: string; endedReason?: string | null } = {},
  ) =>
    db.execute(sql`
      insert into app.founding_discounts (org_id, shape, coupon_id, stripe_subscription_id,
        started_at, ends_at, ended_at, ended_reason)
      values (${orgId}, ${o.shape ?? 'monthly'}, ${o.coupon ?? 'founding_50_six_months'},
        ${`sub_${newId()}`}, '2026-11-10T00:00:00Z', ${o.endsAt ?? '2027-05-10T00:00:00Z'},
        ${o.endedReason ? sql`now()` : sql`null`}, ${o.endedReason ?? null})
    `);

  it('holds one founding discount per organization, ever', async () => {
    const a = await org();
    await insert(a);
    expect(await dbError(insert(a, { shape: 'annual', coupon: 'founding_50_first_year' }))).toMatch(
      /founding_discounts_pkey/,
    );
  });

  it('ties each shape to its coupon, and refuses the retired one', async () => {
    const a = await org();
    for (const [shape, coupon] of [
      ['monthly', 'founding_50_first_year'],
      ['annual', 'founding_50_six_months'],
      ['monthly', 'founding_30_forever'],
    ] as const) {
      expect(await dbError(insert(a, { shape, coupon }))).toMatch(/founding_discounts_coupon/);
    }
    await insert(a, { shape: 'annual', coupon: 'founding_50_first_year' });
  });

  it('needs an end after the start, and a reason with every early end', async () => {
    const a = await org();
    expect(await dbError(insert(a, { endsAt: '2026-11-09T00:00:00Z' }))).toMatch(
      /founding_discounts_term/,
    );
    expect(
      await dbError(
        db.execute(sql`
          insert into app.founding_discounts (org_id, shape, coupon_id, stripe_subscription_id,
            started_at, ends_at, ended_at)
          values (${a}, 'monthly', 'founding_50_six_months', 'sub_x', '2026-11-10T00:00:00Z',
            '2027-05-10T00:00:00Z', now())
        `),
      ),
    ).toMatch(/founding_discounts_ended/);
    await insert(a, { endedReason: 'interval_change' });
  });
});
