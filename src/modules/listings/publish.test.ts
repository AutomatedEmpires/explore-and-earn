// Publishing (spec section 8.3 step 1): the gates, the checks, slot capacity (row 5, unit),
// team approval and the revision decisions.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import type { ListingContent } from './content';
import { decideApproval, publishRevision, rejectRevision, requestPublish } from './index';
import { countSlotHolders } from './slots';
import {
  auditActions,
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
// SP2 lists no subscriber for listing.changed; a test topic makes the event visible.
vi.mock('@/server/event-subscribers', async (orig) => {
  const real = await orig<typeof import('@/server/event-subscribers')>();
  return {
    ...real,
    eventSubscribers: { ...real.eventSubscribers, 'listing.changed': ['test.listing_changed'] },
  };
});

let t: TestDb;
let db: Db;
let org: SeededOrg;
let fx: ListingFixture;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
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

async function appError(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

const details = (e: AppError) =>
  (e.details ?? {}) as { reason?: string; issues?: { code: string }[] };

async function listing(id: string) {
  const [row] = await queryRows<{
    state: string;
    review_stage: string | null;
    pending_revision_id: string | null;
    published_revision_id: string | null;
    first_published_at: string | null;
    next_reminder_at: string | null;
    title: string | null;
  }>(db, sql`select * from app.listings where id = ${id}`);
  if (!row) throw new Error(`no listing ${id}`);
  return row;
}

async function revisions(listingId: string) {
  return queryRows<{ id: string; status: string; revision_number: number }>(
    db,
    sql`select id, status, revision_number from app.listing_revisions
      where listing_id = ${listingId} order by revision_number`,
  );
}

async function draftListing(ctx = org.owner.ctx, edit?: (c: ListingContent) => void) {
  return seedDraftListing(db, ctx, fx.content(edit));
}

/** A published listing (publish requested, then its revision approved). */
async function activeListing(ctx = org.owner.ctx) {
  const id = await draftListing(ctx);
  await requestPublish(db, ctx, id, []);
  const [rev] = await revisions(id);
  await publishRevision(db, rev?.id ?? '', FIXED_NOW);
  return id;
}

describe('requestPublish gates', () => {
  it('refuses a suspended org', async () => {
    const id = await draftListing();
    await db.execute(
      sql`update app.organizations set status = 'suspended' where id = ${org.orgId}`,
    );
    const e = await appError(requestPublish(db, org.owner.ctx, id, []));
    expect([e.code, details(e).reason]).toEqual(['conflict', 'org_suspended']);
  });

  it.each<[string, Parameters<typeof billingFake.setState>[1]]>([
    ['not_entitled', { status: 'canceled', entitled: false, canPublish: false }],
    ['past_due', { status: 'past_due', entitled: true, canPublish: false }],
  ])('refuses %s', async (reason, state) => {
    const id = await draftListing();
    billingFake.setState(org.orgId, state);
    const e = await appError(requestPublish(db, org.owner.ctx, id, []));
    expect([e.code, details(e).reason]).toEqual(['conflict', reason]);
  });

  it('refuses a failed verification', async () => {
    const id = await draftListing();
    verificationFake.setStatus(org.orgId, 'failed');
    const e = await appError(requestPublish(db, org.owner.ctx, id, []));
    expect([e.code, details(e).reason]).toEqual(['conflict', 'verification_failed']);
  });

  it('returns blocking issues and unacknowledged warnings', async () => {
    const blocked = await draftListing(org.owner.ctx, (c) => {
      c.pay.minCents = 0;
    });
    const e = await appError(requestPublish(db, org.owner.ctx, blocked, []));
    expect(e.code).toBe('bad_request');
    expect(details(e).issues?.[0]?.code).toBe('pay_vague');

    const low = await draftListing(org.owner.ctx, (c) => {
      c.pay = { ...c.pay, kind: 'fixed', minCents: 50000, maxCents: 50000, unit: 'week' };
    });
    const w = await appError(requestPublish(db, org.owner.ctx, low, []));
    expect(w.code).toBe('bad_request');
    expect(details(w).issues?.map((i) => i.code)).toEqual(['pay_below_min_wage']);
    await expect(
      requestPublish(db, org.owner.ctx, low, ['pay_below_min_wage']),
    ).resolves.toMatchObject({ state: 'in_review' });
  });
});

describe('requestPublish', () => {
  it('puts a new listing in screening and queues the screen', async () => {
    const id = await draftListing();
    const result = await requestPublish(db, org.owner.ctx, id, []);
    expect(result).toEqual({ state: 'in_review', reviewStage: 'screening' });

    const [rev] = await revisions(id);
    expect(rev?.status).toBe('screening');
    expect(rev?.revision_number).toBe(1);
    const screens = await outboxRows(db, 'listings.screen');
    expect(screens.map((r) => r.dedupe_key)).toContain(`screen:${rev?.id}`);
    expect(screens.find((r) => r.dedupe_key === `screen:${rev?.id}`)?.payload).toEqual({
      revisionId: rev?.id,
      attempt: 0,
    });
    expect(await auditActions(db, id)).toContain('listings.publish_requested');
    expect(await countSlotHolders(db, org.orgId)).toBe(1);
  });

  it('keeps an edited live listing active with a pending revision, using no new slot', async () => {
    const id = await activeListing();
    entitlementsFake.calls.length = 0;
    const result = await requestPublish(db, org.owner.ctx, id, []);
    expect(result).toEqual({ state: 'active', reviewStage: 'screening' });
    const row = await listing(id);
    expect(row.state).toBe('active');
    expect(row.pending_revision_id).not.toBeNull();
    expect(entitlementsFake.calls.find((c) => c.name === 'withCapacity')?.args).toEqual([
      org.orgId,
      'listing_slot',
      0,
    ]);
    expect(await countSlotHolders(db, org.orgId)).toBe(1);
  });

  it('refuses a third listing on two slots (row 5, unit)', async () => {
    entitlementsFake.setLimit(org.orgId, 'listing_slot', 2);
    await requestPublish(db, org.owner.ctx, await draftListing(), []);
    await activeListing();
    const e = await appError(requestPublish(db, org.owner.ctx, await draftListing(), []));
    expect([e.code, details(e).reason]).toEqual(['conflict', 'listing_slot_limit']);
  });

  it('refuses a listing already in review, and a closed one', async () => {
    const id = await draftListing();
    await requestPublish(db, org.owner.ctx, id, []);
    const e = await appError(requestPublish(db, org.owner.ctx, id, []));
    expect([e.code, details(e).reason]).toEqual(['conflict', 'already_in_review']);

    const live = await activeListing();
    await requestPublish(db, org.owner.ctx, live, []);
    const pending = await appError(requestPublish(db, org.owner.ctx, live, []));
    expect(details(pending).reason).toBe('already_in_review');

    const closed = await activeListing();
    await db.execute(
      sql`update app.listings set state = 'closed', closed_at = now(), close_reason = 'host'
        where id = ${closed}`,
    );
    expect(details(await appError(requestPublish(db, org.owner.ctx, closed, []))).reason).toBe(
      'not_publishable',
    );
  });
});

describe('team approval', () => {
  it("holds a Recruiter's listing for an Owner or Admin", async () => {
    await db.execute(
      sql`update app.organizations set require_recruiter_approval = true where id = ${org.orgId}`,
    );
    const admin = await seedMember(db, org.orgId, 'admin');
    const recruiter = await seedMember(db, org.orgId, 'recruiter');

    const id = await draftListing(recruiter.ctx);
    expect(await requestPublish(db, recruiter.ctx, id, [])).toEqual({
      state: 'in_review',
      reviewStage: 'team_approval',
    });
    const [rev] = await revisions(id);
    expect((await outboxRows(db, 'listings.screen')).map((r) => r.dedupe_key)).not.toContain(
      `screen:${rev?.id}`,
    );
    const requested = await notificationsOf(db, 'listings.approval_requested');
    expect(requested.map((n) => n.user_id).sort()).toEqual([admin.userId, org.owner.userId].sort());

    expect(await decideApproval(db, admin.ctx, id, 'approve')).toEqual({
      state: 'in_review',
      reviewStage: 'screening',
    });
    expect((await outboxRows(db, 'listings.screen')).map((r) => r.dedupe_key)).toContain(
      `screen:${rev?.id}`,
    );

    // A second listing, returned by the team.
    const other = await draftListing(recruiter.ctx);
    await requestPublish(db, recruiter.ctx, other, []);
    expect(await decideApproval(db, org.owner.ctx, other, 'return', 'Add the shift times')).toEqual(
      { state: 'draft', reviewStage: null },
    );
    const [returned] = await revisions(other);
    expect(returned?.status).toBe('rejected');
    const decided = await notificationsOf(db, 'listings.approval_decided');
    expect(decided.map((n) => n.user_id)).toContain(recruiter.userId);
    expect(await auditActions(db, other)).toContain('listings.approval_decided');
  });

  it('refuses a decision on a listing that is not waiting for one', async () => {
    const id = await draftListing();
    await requestPublish(db, org.owner.ctx, id, []);
    expect((await appError(decideApproval(db, org.owner.ctx, id, 'approve'))).code).toBe(
      'conflict',
    );
  });
});

describe('publishRevision', () => {
  it('publishes the first revision, then supersedes it with an edit', async () => {
    const id = await draftListing();
    await requestPublish(db, org.owner.ctx, id, []);
    const [first] = await revisions(id);
    await publishRevision(db, first?.id ?? '', FIXED_NOW);

    let row = await listing(id);
    expect(row.state).toBe('active');
    expect(row.review_stage).toBeNull();
    expect(row.published_revision_id).toBe(first?.id);
    expect(new Date(row.first_published_at ?? '').toISOString()).toBe(FIXED_NOW.toISOString());
    expect(new Date(row.next_reminder_at ?? '').toISOString()).toBe(
      new Date(FIXED_NOW.getTime() + 30 * 86_400_000).toISOString(),
    );
    const published = await outboxRows(db, 'hostpages.notify_followers');
    expect(
      published.find((r) => (r.payload.data as { listingId: string }).listingId === id)?.payload,
    ).toMatchObject({
      event: 'listing.published',
      data: { listingId: id, revisionId: first?.id, orgId: org.orgId, first: true },
    });
    expect(await auditActions(db, id)).toContain('listings.published');
    expect((await notificationsOf(db, 'listings.live')).map((n) => n.user_id)).toContain(
      org.owner.userId,
    );

    const later = new Date(FIXED_NOW.getTime() + 5 * 86_400_000);
    await requestPublish(db, org.owner.ctx, id, []);
    const [, second] = await revisions(id);
    await publishRevision(db, second?.id ?? '', later);
    row = await listing(id);
    expect(row.published_revision_id).toBe(second?.id);
    expect(row.pending_revision_id).toBeNull();
    expect(new Date(row.first_published_at ?? '').toISOString()).toBe(FIXED_NOW.toISOString());
    expect((await revisions(id)).map((r) => r.status)).toEqual(['superseded', 'approved']);
    const changed = await outboxRows(db, 'test.listing_changed');
    expect(changed.map((r) => r.payload.data)).toEqual([
      { listingId: id, revisionId: second?.id, orgId: org.orgId },
    ]);
    // Only the first publish notifies followers.
    expect(
      (await outboxRows(db, 'hostpages.notify_followers')).filter(
        (r) => (r.payload.data as { listingId: string }).listingId === id,
      ),
    ).toHaveLength(1);
  });
});

describe('rejectRevision', () => {
  it('returns a never-live listing to draft and frees its slot', async () => {
    const id = await draftListing();
    await requestPublish(db, org.owner.ctx, id, []);
    expect(await countSlotHolders(db, org.orgId)).toBe(1);
    const [rev] = await revisions(id);
    await rejectRevision(db, rev?.id ?? '', ['moderation'], FIXED_NOW);
    expect((await listing(id)).state).toBe('draft');
    expect(await countSlotHolders(db, org.orgId)).toBe(0);
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.find((n) => n.data.listingId === id)?.data).toMatchObject({
      reasons: ['moderation'],
      href: `/host/listings/${id}`,
    });
    expect(await auditActions(db, id)).toContain('listings.revision_rejected');
  });

  it('keeps the live revision when an edit is rejected', async () => {
    const id = await activeListing();
    await requestPublish(db, org.owner.ctx, id, []);
    const [live, pending] = await revisions(id);
    await rejectRevision(db, pending?.id ?? '', ['link_unsafe'], FIXED_NOW);
    const row = await listing(id);
    expect(row.state).toBe('active');
    expect(row.published_revision_id).toBe(live?.id);
    expect(row.pending_revision_id).toBeNull();
    expect(row.review_stage).toBeNull();
  });
});

it('counts in-review and active listings as slot holders', async () => {
  await draftListing();
  await requestPublish(db, org.owner.ctx, await draftListing(), []);
  await activeListing();
  expect(await countSlotHolders(db, org.orgId)).toBe(2);
  expect(await countSlotHolders(db, newId())).toBe(0);
});
