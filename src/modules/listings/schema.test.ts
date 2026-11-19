// drizzle/1200_listings.sql: the immutable published revision, the revision CHECKs, the
// listing review-stage rule and the occupations seed.
import { SQL, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import { listOccupations } from './index';

let t: TestDb;
let db: Db;
let orgId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  orgId = (await seedHostOrg(db)).orgId;
});

afterAll(async () => {
  await t.close();
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

async function insertListing(): Promise<string> {
  const id = newId();
  await db.execute(sql`insert into app.listings (id, org_id) values (${id}, ${orgId})`);
  return id;
}

type Cols = Record<string, unknown>;

/** A valid revision row, with `cols` replacing defaults (an SQL value is inlined as is). */
async function insertRevision(listingId: string, cols: Cols = {}): Promise<string> {
  const id = newId();
  const values: Cols = {
    id,
    listing_id: listingId,
    org_id: orgId,
    revision_number: Math.floor(Math.random() * 1_000_000),
    status: 'screening',
    content: sql`'{}'::jsonb`,
    title: 'Lift Operator',
    primary_category: 'seasonal',
    genre: 'ski_resorts',
    occupation_code: 'lift_operator',
    employment_type: 'employee',
    schedule: 'full_time',
    openings: 1,
    date_mode: 'fixed',
    start_date: sql`'2027-06-01'::date`,
    end_date: sql`'2027-08-31'::date`,
    weekly_hours: 40,
    pay_kind: 'range',
    pay_min_cents: 1900,
    pay_max_cents: 2200,
    pay_unit: 'hour',
    housing_provided: true,
    housing_free: false,
    housing_cost_cents: 15000,
    housing_cost_period: 'week',
    meals_provided: false,
    visa_sponsorship: 'none',
    min_age: 18,
    timezone: 'America/Los_Angeles',
    ...cols,
  };
  const names = Object.keys(values).map((k) => sql.identifier(k));
  const params = Object.values(values).map((v) => (v instanceof SQL ? v : sql`${v}`));
  await db.execute(
    sql`insert into app.listing_revisions (${sql.join(names, sql`, `)}) values (${sql.join(params, sql`, `)})`,
  );
  return id;
}

describe('listing_revisions', () => {
  it('accepts a valid row', async () => {
    const listingId = await insertListing();
    await expect(insertRevision(listingId)).resolves.toBeTypeOf('string');
  });

  it.each<[string, Cols]>([
    ['housing provided with housing_free null', { housing_free: null, housing_cost_cents: null }],
    [
      'housing not provided with a cost',
      { housing_provided: false, housing_free: null, housing_cost_cents: 100 },
    ],
    ['housing_free false and cost 0', { housing_cost_cents: 0 }],
    ['min_age 17', { min_age: 17 }],
    ['crew share without crew_min_cents', { pay_unit: 'crew_share' }],
    ['end before start', { end_date: sql`'2027-05-01'::date` }],
    ['pay_min_cents 0', { pay_min_cents: 0 }],
    [
      'meals provided with meals_free null',
      { meals_provided: true, meals_free: null, meals_cost_cents: null },
    ],
  ])('rejects %s', async (_name, cols) => {
    const listingId = await insertListing();
    expect(await dbError(insertRevision(listingId, cols))).toMatch(/check constraint/);
  });

  it('keeps an approved revision immutable; only approved -> superseded is allowed', async () => {
    const listingId = await insertListing();
    const a = await insertRevision(listingId, { status: 'approved' });

    expect(
      await dbError(
        db.execute(
          sql`update app.listing_revisions set content = '{"x":1}'::jsonb where id = ${a}`,
        ),
      ),
    ).toMatch(/immutable/);
    expect(
      await dbError(
        db.execute(sql`update app.listing_revisions set status = 'rejected' where id = ${a}`),
      ),
    ).toMatch(/immutable/);
    await db.execute(sql`update app.listing_revisions set status = 'superseded' where id = ${a}`);

    // A revision under review can still change.
    const b = await insertRevision(listingId, { status: 'screening' });
    await db.execute(
      sql`update app.listing_revisions set status = 'rejected', checks = '{}'::jsonb where id = ${b}`,
    );
  });
});

describe('listings', () => {
  it('needs a review stage exactly when in review or holding a pending revision', async () => {
    const id = newId();
    expect(
      await dbError(
        db.execute(sql`
          insert into app.listings (id, org_id, state, review_stage)
          values (${id}, ${orgId}, 'draft', 'screening')
        `),
      ),
    ).toMatch(/listings_review_stage/);
    expect(
      await dbError(
        db.execute(sql`
          insert into app.listings (id, org_id, state) values (${newId()}, ${orgId}, 'in_review')
        `),
      ),
    ).toMatch(/listings_review_stage/);
    await db.execute(sql`
      insert into app.listings (id, org_id, state, review_stage)
      values (${id}, ${orgId}, 'in_review', 'screening')
    `);
  });

  it('links member assignments to listings', async () => {
    expect(
      await dbError(
        db.execute(sql`
          insert into app.member_assignments (id, membership_id, listing_id)
          select ${newId()}, id, ${newId()} from app.org_memberships limit 1
        `),
      ),
    ).toMatch(/foreign key/);
  });
});

describe('occupations', () => {
  it('seeds at least 120, at least 20 per category, with O*NET-SOC codes', async () => {
    const list = await listOccupations(db);
    expect(list.length).toBeGreaterThanOrEqual(120);
    for (const category of ['maritime', 'seasonal', 'farm', 'remote'] as const) {
      expect(list.filter((o) => o.categories.includes(category)).length).toBeGreaterThanOrEqual(20);
    }
    for (const o of list) expect(o.socCode).toMatch(/^\d{2}-\d{4}\.\d{2}$/);
    const byCode = new Map(list.map((o) => [o.code, o]));
    expect(byCode.get('lift_operator')).toBeDefined();
    expect(byCode.get('deckhand')?.socCode).toBe('53-5011.00');
    expect(byCode.get('seafood_processing_worker')).toBeDefined();
    expect(byCode.get('farmworker_crop')?.socCode).toBe('45-2092.00');
    expect(byCode.get('customer_service_representative')?.socCode).toBe('43-4051.00');
  });
});
