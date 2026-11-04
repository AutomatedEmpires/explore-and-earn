// Slot enforcement (spec section 8.6): lapse, downgrade with and without a keep list, and
// closing every listing of a suspended org. Every closure emits listing.closed and records
// listings.closed in the same transaction (spec failure mode 1).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { defineType, getType } from '@/modules/notifications';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import { closeAllForOrg, enforceSlotLimit, jobHandlers, requestPublish } from './index';
import {
  notificationsOf,
  outboxRows,
  seedDraftListing,
  seedListingFixture,
  seedLiveListing,
  type ListingFixture,
} from './test-fixtures';

vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));
vi.mock('@/modules/billing', async (orig) => ({
  ...(await orig<typeof import('@/modules/billing')>()),
  ...(await import('../../../tests/fakes/sp2/billing')).billingFake,
}));
vi.mock('@/modules/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/modules/entitlements')>()),
  ...(await import('../../../tests/fakes/sp2/entitlements')).entitlementsFake,
}));
vi.mock('@/modules/verification', async (orig) => ({
  ...(await orig<typeof import('@/modules/verification')>()),
  ...(await import('../../../tests/fakes/sp2/verification')).verificationFake,
}));
// SP2 lists no subscriber for listing.closed; a test topic counts its envelopes.
vi.mock('@/server/event-subscribers', async (orig) => {
  const real = await orig<typeof import('@/server/event-subscribers')>();
  return {
    ...real,
    eventSubscribers: { ...real.eventSubscribers, 'listing.closed': ['test.listing_closed'] },
  };
});

let t: TestDb;
let db: Db;
let org: SeededOrg;
let fx: ListingFixture;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  // Billing (W2) defines this type; the billing module is faked here.
  if (!getType('billing.plan_changed')) {
    defineType({
      type: 'billing.plan_changed',
      category: 'billing',
      title: () => 'Your plan changed',
      body: () => 'Your plan changed.',
    });
  }
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  for (const f of [orgsFake, locationsFake, billingFake, entitlementsFake, verificationFake]) {
    f.reset();
  }
  org = await seedHostOrg(db);
  fx = await seedListingFixture(db, org);
});

type Row = {
  id: string;
  state: string;
  close_reason: string | null;
  published_revision_id: string | null;
};

async function rows(ids: string[]): Promise<Map<string, Row>> {
  const list = await queryRows<Row>(
    db,
    sql`select id, state, close_reason, published_revision_id from app.listings
      where org_id = ${org.orgId}`,
  );
  return new Map(list.filter((r) => ids.includes(r.id)).map((r) => [r.id, r]));
}

/** Three live listings first published a day apart: A, then B, then C. */
async function threeLive() {
  const ids: string[] = [];
  for (const [i, title] of ['Lift Operator A', 'Lift Operator B', 'Lift Operator C'].entries()) {
    const { id } = await seedLiveListing(
      db,
      org.owner.ctx,
      fx.content((c) => {
        c.basics.title = title;
      }),
      new Date(FIXED_NOW.getTime() + i * 86_400_000),
    );
    ids.push(id);
  }
  return ids as [string, string, string];
}

const closedEnvelopes = async (listingId: string) =>
  (await outboxRows(db, 'test.listing_closed'))
    .map((r) => r.payload)
    .filter((p) => (p.data as { listingId: string }).listingId === listingId);

const closedAudits = (listingId: string) =>
  queryRows<{ org_id: string; data: { reason: string } }>(
    db,
    sql`select org_id, data from app.audit_events
      where action = 'listings.closed' and subject_id = ${listingId}`,
  );

describe('enforceSlotLimit', () => {
  it('keeps the keep list on a downgrade and closes the rest', async () => {
    const [a, b, c] = await threeLive();
    entitlementsFake.setLimit(org.orgId, 'listing_slot', 2);
    billingFake.setKeepList(org.orgId, [b, c]);
    await enforceSlotLimit(db, org.orgId);

    const r = await rows([a, b, c]);
    expect([r.get(a)?.state, r.get(a)?.close_reason]).toEqual(['closed', 'downgrade']);
    expect([r.get(b)?.state, r.get(c)?.state]).toEqual(['active', 'active']);
    expect(billingFake.callsTo('settlePendingChange')).toEqual([[org.orgId]]);
    expect(entitlementsFake.calls.some((x) => x.name === 'lockOrg')).toBe(true);

    const envelopes = await closedEnvelopes(a);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.data).toEqual({
      listingId: a,
      orgId: org.orgId,
      revisionId: r.get(a)?.published_revision_id,
      reason: 'downgrade',
    });
    const audits = await closedAudits(a);
    expect(audits.map((x) => [x.org_id, x.data.reason])).toEqual([[org.orgId, 'downgrade']]);
    const told = (await notificationsOf(db, 'billing.plan_changed')).filter(
      (n) => n.user_id === org.owner.userId,
    );
    expect(told.map((n) => n.data)).toEqual([{ closed: ['Lift Operator A'] }]);
  });

  it('keeps the earliest without a keep list; on a tie, the higher id closes', async () => {
    const [a, b, c] = await threeLive();
    entitlementsFake.setLimit(org.orgId, 'listing_slot', 2);
    await enforceSlotLimit(db, org.orgId);
    let r = await rows([a, b, c]);
    expect([r.get(a)?.state, r.get(b)?.state, r.get(c)?.state]).toEqual([
      'active',
      'active',
      'closed',
    ]);

    // Equal first_published_at: the higher id closes.
    await db.execute(sql`
      update app.listings set state = 'active', closed_at = null, close_reason = null,
        first_published_at = ${FIXED_NOW}
      where id in (${a}, ${b}, ${c})
    `);
    entitlementsFake.setLimit(org.orgId, 'listing_slot', 1);
    await enforceSlotLimit(db, org.orgId);
    r = await rows([a, b, c]);
    const sorted = [a, b, c].sort();
    expect(sorted.map((id) => r.get(id)?.state)).toEqual(['active', 'closed', 'closed']);
  });

  it('returns a never-live listing in review to draft, writing no close event', async () => {
    const [a, b] = await threeLive();
    const pendingId = await seedDraftListing(db, org.owner.ctx, fx.content());
    await requestPublish(db, org.owner.ctx, pendingId, [], FIXED_NOW);
    entitlementsFake.setLimit(org.orgId, 'listing_slot', 2);
    billingFake.setKeepList(org.orgId, [a, b]);
    await enforceSlotLimit(db, org.orgId);

    const r = await rows([pendingId]);
    expect(r.get(pendingId)?.state).toBe('draft');
    expect(await closedEnvelopes(pendingId)).toEqual([]);
    expect(await closedAudits(pendingId)).toEqual([]);
  });

  it('closes everything with lapsed when not entitled', async () => {
    const ids = await threeLive();
    billingFake.setState(org.orgId, { status: 'canceled', entitled: false, canPublish: false });
    await enforceSlotLimit(db, org.orgId);
    const r = await rows(ids);
    for (const id of ids) {
      expect([r.get(id)?.state, r.get(id)?.close_reason]).toEqual(['closed', 'lapsed']);
      expect((await closedEnvelopes(id)).map((e) => (e.data as { reason: string }).reason)).toEqual(
        ['lapsed'],
      );
      expect((await closedAudits(id)).map((x) => x.data.reason)).toEqual(['lapsed']);
    }
    expect(billingFake.callsTo('settlePendingChange')).toHaveLength(1);
  });

  it('closes nothing for a past-due subscription', async () => {
    const ids = await threeLive();
    billingFake.setState(org.orgId, { status: 'past_due', entitled: true, canPublish: false });
    await enforceSlotLimit(db, org.orgId);
    const r = await rows(ids);
    expect(ids.map((id) => r.get(id)?.state)).toEqual(['active', 'active', 'active']);
  });

  it('runs from the subscription.changed subscriber', async () => {
    const [a] = await threeLive();
    billingFake.setState(org.orgId, { status: 'canceled', entitled: false, canPublish: false });
    await jobHandlers['listings.enforce_slot_limit']?.(
      {
        event: 'subscription.changed',
        eventId: 'e1',
        data: { orgId: org.orgId, status: 'canceled', plan: null },
      },
      { db, now: FIXED_NOW },
    );
    expect((await rows([a])).get(a)?.state).toBe('closed');
  });
});

describe('close_for_org', () => {
  const handle = (status: 'active' | 'suspended' | 'banned') =>
    jobHandlers['listings.close_for_org']?.(
      { event: 'org.status_changed', eventId: `s-${status}`, data: { orgId: org.orgId, status } },
      { db, now: FIXED_NOW },
    );

  it('closes every live listing of a suspended org', async () => {
    await seedMember(db, org.orgId, 'admin');
    const ids = await threeLive();
    await handle('active');
    expect([...(await rows(ids)).values()].map((r) => r.state)).toEqual([
      'active',
      'active',
      'active',
    ]);
    expect(await closedEnvelopes(ids[0])).toEqual([]);

    await handle('suspended');
    const r = await rows(ids);
    for (const id of ids) {
      expect([r.get(id)?.state, r.get(id)?.close_reason]).toEqual(['closed', 'org_suspended']);
      expect((await closedEnvelopes(id)).map((e) => (e.data as { reason: string }).reason)).toEqual(
        ['org_suspended'],
      );
      expect((await closedAudits(id)).map((x) => x.data.reason)).toEqual(['org_suspended']);
    }
  });

  it('closes with host on org deletion', async () => {
    const [a] = await threeLive();
    await closeAllForOrg(db, org.orgId, 'host');
    expect((await rows([a])).get(a)?.close_reason).toBe('host');
  });
});
