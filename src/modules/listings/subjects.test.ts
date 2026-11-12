// Operator decisions on listings (spec section 6 subject handlers) and "Ask for a review".
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { decide, openReviewItem } from '@/modules/trust';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import type { ListingContent } from './content';
import { jobHandlers, requestPublish, requestReview } from './index';
import { countSlotHolders } from './slots';
import {
  addOperator,
  notificationsOf,
  outboxRows,
  seedDraftListing,
  seedListingFixture,
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
vi.mock('@/server/event-subscribers', async (orig) => {
  const real = await orig<typeof import('@/server/event-subscribers')>();
  return {
    ...real,
    eventSubscribers: { ...real.eventSubscribers, 'listing.removed': ['test.listing_removed'] },
  };
});

let t: TestDb;
let db: Db;
let org: SeededOrg;
let fx: ListingFixture;
let operator: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  operator = await addOperator(db);
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

const screen = (revisionId: string) =>
  jobHandlers['listings.screen']?.({ revisionId, attempt: 0 }, { db, now: FIXED_NOW });

async function submitted(edit?: (c: ListingContent) => void, ctx = org.owner.ctx) {
  const id = await seedDraftListing(db, ctx, fx.content(edit));
  await requestPublish(db, ctx, id, [], FIXED_NOW);
  const [rev] = await queryRows<{ id: string }>(
    db,
    sql`select id from app.listing_revisions where listing_id = ${id} order by revision_number desc`,
  );
  return { id, revisionId: rev?.id ?? '' };
}

async function live(ctx = org.owner.ctx) {
  const s = await submitted(undefined, ctx);
  await screen(s.revisionId);
  return s;
}

const listingState = async (id: string) =>
  (await queryRows<{ state: string }>(db, sql`select state from app.listings where id = ${id}`))[0]
    ?.state;

const openItems = (subjectId: string) =>
  queryRows<{ id: string; queue: string; reason: string; original_item_id: string | null }>(
    db,
    sql`select id, queue, reason, original_item_id from app.review_items
      where subject_id = ${subjectId} and status <> 'resolved' order by created_at, id`,
  );

describe('listing_revision', () => {
  it('publishes only once every open item on the revision is approved', async () => {
    const { id, revisionId } = await submitted((c) => {
      c.job.description += ' __flag__';
    });
    await screen(revisionId);
    const [first, second] = await openItems(revisionId);
    expect([first?.queue, second?.queue].sort()).toEqual(['fraud', 'moderation']);

    await decide(db, first?.id ?? '', operator, 'approve');
    expect(await listingState(id)).toBe('in_review');
    await decide(db, second?.id ?? '', operator, 'approve');
    expect(await listingState(id)).toBe('active');
  });

  it('rejects the revision on remove, and returns it with the note on ask_info', async () => {
    const removed = await submitted((c) => {
      c.job.description += ' __flag__';
    });
    await screen(removed.revisionId);
    const [item] = await openItems(removed.revisionId);
    await decide(db, item?.id ?? '', operator, 'remove');
    expect(await listingState(removed.id)).toBe('draft');

    const asked = await submitted((c) => {
      c.job.description += ' __flag__';
    });
    await screen(asked.revisionId);
    const [askItem] = await openItems(asked.revisionId);
    await decide(db, askItem?.id ?? '', operator, 'ask_info', { note: 'Add the shift times' });
    expect(await listingState(asked.id)).toBe('draft');
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.find((n) => n.data.listingId === asked.id)?.data).toMatchObject({
      note: 'Add the shift times',
    });
  });

  it('republishes a rejected revision on an approved review, when a slot is free', async () => {
    const { id, revisionId } = await submitted((c) => {
      c.job.description += ' __block__';
    });
    await screen(revisionId);
    expect(await listingState(id)).toBe('draft');
    await requestReview(db, org.owner.ctx, id, 'Nothing here is wrong.');
    const [review] = await openItems(revisionId);
    expect(review?.reason).toBe('host_requested_review');

    entitlementsFake.setLimit(org.orgId, 'listing_slot', 0);
    await decide(db, review?.id ?? '', operator, 'approve');
    expect(await listingState(id)).toBe('draft');
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.filter((n) => n.data.listingId === id).at(-1)?.data.reasons).toEqual([
      'listing_slot_limit',
    ]);

    entitlementsFake.setLimit(org.orgId, 'listing_slot', null);
    await requestReview(db, org.owner.ctx, id, 'Please look again.');
    const [again] = await openItems(revisionId);
    await decide(db, again?.id ?? '', operator, 'approve');
    expect(await listingState(id)).toBe('active');
  });

  it('sanctions the org on suspend', async () => {
    const { revisionId } = await submitted((c) => {
      c.job.description += ' __flag__';
    });
    await screen(revisionId);
    const [item] = await openItems(revisionId);
    await decide(db, item?.id ?? '', operator, 'suspend');
    expect(billingFake.callsTo('sanctionOrg').map((a) => [a[0], a[1]])).toEqual([
      [org.orgId, 'suspend'],
    ]);
  });
});

describe('listing', () => {
  it('removes a live listing, freeing its slot and telling the team and owners', async () => {
    const admin = await seedMember(db, org.orgId, 'admin');
    const recruiter = await seedMember(db, org.orgId, 'recruiter');
    const { id } = await live(recruiter.ctx);
    expect(await countSlotHolders(db, org.orgId)).toBe(1);

    const { id: itemId } = await openReviewItem(db, {
      queue: 'reports',
      subjectType: 'listing',
      subjectId: id,
      reason: 'report',
    });
    await decide(db, itemId, operator, 'remove');
    expect(await listingState(id)).toBe('removed');
    expect(await countSlotHolders(db, org.orgId)).toBe(0);
    const events = await outboxRows(db, 'test.listing_removed');
    expect(events.map((e) => e.payload.data)).toEqual([
      { listingId: id, orgId: org.orgId, reason: 'moderation' },
    ]);
    const removed = await notificationsOf(db, 'listings.removed');
    expect(removed.map((n) => n.user_id).sort()).toEqual(
      [recruiter.userId, admin.userId, org.owner.userId].sort(),
    );
  });

  it('dismisses a report on approve, and sanctions on ban', async () => {
    const { id } = await live();
    const { id: dismiss } = await openReviewItem(db, {
      queue: 'reports',
      subjectType: 'listing',
      subjectId: id,
      reason: 'report',
    });
    await decide(db, dismiss, operator, 'approve');
    expect(await listingState(id)).toBe('active');

    const { id: ban } = await openReviewItem(db, {
      queue: 'reports',
      subjectType: 'listing',
      subjectId: id,
      reason: 'report',
    });
    await decide(db, ban, operator, 'ban');
    expect(billingFake.callsTo('sanctionOrg').map((a) => a[1])).toEqual(['ban']);
  });
});

describe('requestReview', () => {
  it('appeals a removal against the item that removed the listing', async () => {
    const { id } = await live();
    const { id: itemId } = await openReviewItem(db, {
      queue: 'reports',
      subjectType: 'listing',
      subjectId: id,
      reason: 'report',
    });
    await decide(db, itemId, operator, 'remove');
    await requestReview(db, org.owner.ctx, id, 'We fixed the wording.');
    const appeals = (await openItems(id)).filter((i) => i.queue === 'appeals');
    expect(appeals.map((a) => a.original_item_id)).toEqual([itemId]);
  });

  it('appeals a failed verification through verification', async () => {
    verificationFake.setStatus(org.orgId, 'running');
    const { id, revisionId } = await submitted();
    await screen(revisionId);
    await jobHandlers['listings.resume_screening']?.(
      {
        event: 'verification.decided',
        eventId: newId(),
        data: { orgId: org.orgId, status: 'failed' },
      },
      { db, now: FIXED_NOW },
    );
    await requestReview(db, org.owner.ctx, id, 'We are a real lodge.');
    expect(verificationFake.calls.find((c) => c.name === 'openVerificationAppeal')?.args).toEqual([
      org.orgId,
      'We are a real lodge.',
    ]);
  });

  it('refuses a listing with nothing to review', async () => {
    const id = await seedDraftListing(db, org.owner.ctx, fx.content());
    await expect(requestReview(db, org.owner.ctx, id, 'Why?')).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});
