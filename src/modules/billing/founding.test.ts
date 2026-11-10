// The FD-7 founding offer rules (./founding.ts): shapes, the introductory period, eligibility
// and the founding status. Sync, checkout and plan changes are tested with their modules.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { reserveFoundingNumber } from '@/modules/orgs';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import {
  foundingSpotsLeft,
  foundingStatusOf,
  getFoundingEligibility,
  getFoundingSummary,
  introEndsAt,
  shapeOfCoupon,
  type FoundingDiscountRow,
} from './founding';
import { addMonths } from './internal';

let t: TestDb;
let org: SeededOrg;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.founding_discounts`);
  await t.db.execute(sql`delete from app.founding_cohort`);
  org = await seedHostOrg(t.db);
});

const START = new Date('2026-11-10T09:30:00Z');

function discount(o: Partial<FoundingDiscountRow> = {}): FoundingDiscountRow {
  return {
    orgId: org.orgId,
    shape: 'monthly',
    couponId: 'founding_50_six_months',
    stripeSubscriptionId: 'sub_1',
    startedAt: START,
    endsAt: introEndsAt('monthly', START),
    endedAt: null,
    endedReason: null,
    createdAt: START,
    updatedAt: START,
    ...o,
  };
}

async function subscriptionRow(status: string, stripeId = `sub_${newId()}`) {
  await t.db.execute(sql`
    insert into app.subscriptions (id, org_id, stripe_subscription_id, status, plan, interval)
    values (${newId()}, ${org.orgId}, ${stripeId}, ${status}, 'starter', 'month')
  `);
  return stripeId;
}

describe('shapes and the introductory period', () => {
  it('maps each founding coupon to its shape, and nothing else to one', () => {
    expect(shapeOfCoupon('founding_50_six_months')).toBe('monthly');
    expect(shapeOfCoupon('founding_50_first_year')).toBe('annual');
    expect(shapeOfCoupon('founding_30_forever')).toBeNull();
    expect(shapeOfCoupon('SPRING10')).toBeNull();
    expect(shapeOfCoupon(null)).toBeNull();
  });

  it('lasts six calendar months for monthly and one annual term for annual', () => {
    expect(introEndsAt('monthly', START)).toEqual(new Date('2027-05-10T09:30:00Z'));
    expect(introEndsAt('annual', START)).toEqual(new Date('2027-11-10T09:30:00Z'));
    // A day the end month lacks becomes its last day, as Stripe counts billing months.
    expect(introEndsAt('monthly', new Date('2026-08-31T00:00:00Z'))).toEqual(
      new Date('2027-02-28T00:00:00Z'),
    );
    expect(introEndsAt('annual', new Date('2028-02-29T00:00:00Z'))).toEqual(
      new Date('2029-02-28T00:00:00Z'),
    );
    expect(addMonths(new Date('2026-01-31T12:00:00Z'), 1)).toEqual(new Date('2026-02-28T12:00:00Z'));
  });
});

describe('foundingStatusOf', () => {
  const eligible = { eligible: true as const, foundingNumber: 7 };
  const outside = { eligible: false as const, reason: 'not_in_cohort' as const, foundingNumber: null };

  it('is eligible or none before any discount', () => {
    expect(foundingStatusOf({ eligibility: eligible, discount: null })).toBe('eligible');
    expect(foundingStatusOf({ eligibility: outside, discount: null })).toBe('none');
  });

  it('is active until the period ends on its own or early, then ended', () => {
    const used = { eligible: false as const, reason: 'intro_used' as const, foundingNumber: 7 };
    const d = discount();
    expect(foundingStatusOf({ eligibility: used, discount: d }, START)).toBe('active');
    expect(foundingStatusOf({ eligibility: used, discount: d }, new Date('2027-05-10T09:29:59Z'))).toBe(
      'active',
    );
    expect(foundingStatusOf({ eligibility: used, discount: d }, d.endsAt)).toBe('ended');
    const early = discount({ endedAt: START, endedReason: 'interval_change' });
    expect(foundingStatusOf({ eligibility: used, discount: early }, START)).toBe('ended');
  });
});

describe('getFoundingEligibility', () => {
  it('needs one of the first 100 signups', async () => {
    expect(await getFoundingEligibility(t.db, org.orgId)).toEqual({
      eligible: false,
      reason: 'not_in_cohort',
      foundingNumber: null,
    });
    const n = await reserveFoundingNumber(t.db, org.orgId);
    expect(await getFoundingEligibility(t.db, org.orgId)).toEqual({
      eligible: true,
      foundingNumber: n,
    });
  });

  it('is used up by a founding discount or any subscription that activated', async () => {
    await reserveFoundingNumber(t.db, org.orgId);
    await subscriptionRow('incomplete');
    await subscriptionRow('incomplete_expired');
    expect((await getFoundingEligibility(t.db, org.orgId)).eligible).toBe(true);

    const activated = await subscriptionRow('canceled');
    expect(await getFoundingEligibility(t.db, org.orgId)).toMatchObject({
      eligible: false,
      reason: 'intro_used',
    });
    // Sync asks about the subscription it is syncing, leaving that one out.
    expect(
      (await getFoundingEligibility(t.db, org.orgId, { exceptStripeId: activated })).eligible,
    ).toBe(true);

    const other = await seedHostOrg(t.db);
    await reserveFoundingNumber(t.db, other.orgId);
    await t.db.execute(sql`
      insert into app.founding_discounts (org_id, shape, coupon_id, stripe_subscription_id,
        started_at, ends_at)
      values (${other.orgId}, 'annual', 'founding_50_first_year', 'sub_other', ${START},
        ${introEndsAt('annual', START)})
    `);
    expect(await getFoundingEligibility(t.db, other.orgId)).toMatchObject({
      eligible: false,
      reason: 'intro_used',
    });
  });
});

describe('getFoundingSummary and foundingSpotsLeft', () => {
  it('reports the number, shape and end, and counts the spots left', async () => {
    expect(await foundingSpotsLeft(t.db)).toBe(100);
    const n = await reserveFoundingNumber(t.db, org.orgId);
    expect(await foundingSpotsLeft(t.db)).toBe(99);
    expect(await getFoundingSummary(t.db, org.orgId)).toEqual({
      status: 'eligible',
      number: n,
      shape: null,
      percentOff: 50,
      startedAt: null,
      endsAt: null,
    });

    await t.db.execute(sql`
      insert into app.founding_discounts (org_id, shape, coupon_id, stripe_subscription_id,
        started_at, ends_at, ended_at, ended_reason)
      values (${org.orgId}, 'monthly', 'founding_50_six_months', 'sub_1', ${START},
        ${introEndsAt('monthly', START)}, ${new Date('2027-01-02T00:00:00Z')}, 'interval_change')
    `);
    expect(await getFoundingSummary(t.db, org.orgId, START)).toEqual({
      status: 'ended',
      number: n,
      shape: 'monthly',
      percentOff: 50,
      startedAt: START,
      endsAt: new Date('2027-01-02T00:00:00Z'),
    });
  });
});
