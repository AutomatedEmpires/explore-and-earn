// The listing lifecycle (spec section 1 row 8, section 8.2): "Still hiring?" reminders, the
// timezone-correct auto-close, the application deadline, closing, confirming and reposting.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import type { ListingContent } from './content';
import {
  canAcceptApplications,
  closeListing,
  confirmActive,
  jobHandlers,
  publishRevision,
  repostListing,
  requestPublish,
} from './index';
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
// SP2 lists no subscriber for listing.closed; a test topic makes the event visible.
vi.mock('@/server/event-subscribers', async (orig) => {
  const real = await orig<typeof import('@/server/event-subscribers')>();
  return {
    ...real,
    eventSubscribers: { ...real.eventSubscribers, 'listing.closed': ['test.listing_closed'] },
  };
});

const DAY = 86_400_000;
const at = (days: number) => new Date(FIXED_NOW.getTime() + days * DAY);

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
  fx = await seedListingFixture(db, org, { timezone: 'Pacific/Honolulu', state: 'HI' });
});

async function appError(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

/** A live listing, published at `now`. */
async function live(edit?: (c: ListingContent) => void, now = FIXED_NOW) {
  const id = await seedDraftListing(db, org.owner.ctx, fx.content(edit));
  await requestPublish(db, org.owner.ctx, id, [], now);
  const [rev] = await queryRows<{ id: string }>(
    db,
    sql`select id from app.listing_revisions where listing_id = ${id}`,
  );
  await publishRevision(db, rev?.id ?? '', now);
  return id;
}

async function row(id: string) {
  const [r] = await queryRows<{
    state: string;
    close_reason: string | null;
    next_reminder_at: string | null;
    reminders_sent: number;
    confirmed_active_at: string | null;
    repost_reminded_year: number | null;
  }>(db, sql`select * from app.listings where id = ${id}`);
  if (!r) throw new Error(`no listing ${id}`);
  return r;
}

const run = (topic: string, now: Date) => jobHandlers[topic]?.(undefined, { db, now });

describe('"Still hiring?" reminders', () => {
  it('fires at 30, 60, 90, 180 and 270 days, each once', async () => {
    const id = await live();
    const sentAt: number[] = [];
    for (const d of [29, 30, 30, 60, 90, 179, 180, 270]) {
      const before = (await notificationsOf(db, 'listings.still_hiring')).filter(
        (n) => n.data.listingId === id,
      ).length;
      await run('listings.still_hiring_sweep', at(d));
      const after = (await notificationsOf(db, 'listings.still_hiring')).filter(
        (n) => n.data.listingId === id,
      );
      if (after.length > before) sentAt.push(d);
      if (d === 30 && sentAt.length === 1) {
        expect(after[0]?.title).toBe('Still hiring?');
      }
    }
    expect(sentAt).toEqual([30, 60, 90, 180, 270]);
    expect((await row(id)).reminders_sent).toBe(5);
  });

  it("doesn't move the next reminder when the host confirms", async () => {
    const id = await live();
    await run('listings.still_hiring_sweep', at(30));
    const before = (await row(id)).next_reminder_at;
    const result = await confirmActive(db, org.owner.ctx, id, at(31));
    expect(result.confirmedActiveAt.toISOString()).toBe(at(31).toISOString());
    const after = await row(id);
    expect(after.next_reminder_at).toBe(before);
    expect(after.confirmed_active_at).not.toBeNull();
    expect(await auditActions(db, id)).toContain('listings.confirmed_active');
  });
});

describe('auto-close', () => {
  it('closes a Honolulu listing at local midnight after its end date', async () => {
    const id = await live();
    await run('listings.auto_close', new Date('2027-09-01T09:59:00Z'));
    expect((await row(id)).state).toBe('active');
    await run('listings.auto_close', new Date('2027-09-01T10:00:00Z'));
    const r = await row(id);
    expect([r.state, r.close_reason]).toEqual(['closed', 'end_date']);
    expect(
      (await notificationsOf(db, 'listings.auto_closed')).some((n) => n.data.listingId === id),
    ).toBe(true);
    const closed = await outboxRows(db, 'test.listing_closed');
    expect(
      closed.find((e) => (e.payload.data as { listingId: string }).listingId === id)?.payload.data,
    ).toMatchObject({ listingId: id, orgId: org.orgId, reason: 'end_date' });
  });

  it('never closes a season listing on its own', async () => {
    const id = await live((c) => {
      c.when.dates = { mode: 'season', season: 'summer', year: 2027 };
    });
    await run('listings.auto_close', new Date('2028-12-31T00:00:00Z'));
    expect((await row(id)).state).toBe('active');
  });
});

describe('canAcceptApplications', () => {
  it('stops applications after the deadline but keeps the listing live', async () => {
    const id = await live((c) => {
      c.applying.deadline = '2027-05-01';
    });
    expect(await canAcceptApplications(db, id, new Date('2027-05-02T09:59:00Z'))).toMatchObject({
      ok: true,
    });
    expect(await canAcceptApplications(db, id, new Date('2027-05-02T10:00:00Z'))).toEqual({
      ok: false,
      reason: 'deadline_passed',
    });
    expect((await row(id)).state).toBe('active');
    expect(await countSlotHolders(db, org.orgId)).toBe(1);
  });

  it('refuses a closed listing and a suspended org', async () => {
    const id = await live();
    await db.execute(
      sql`update app.organizations set status = 'suspended' where id = ${org.orgId}`,
    );
    expect(await canAcceptApplications(db, id, FIXED_NOW)).toEqual({
      ok: false,
      reason: 'org_inactive',
    });
    await db.execute(sql`update app.organizations set status = 'active' where id = ${org.orgId}`);
    await closeListing(db, org.owner.ctx, id, FIXED_NOW);
    expect(await canAcceptApplications(db, id, FIXED_NOW)).toEqual({
      ok: false,
      reason: 'not_active',
    });
  });
});

describe('closeListing', () => {
  it('frees the slot and emits listing.closed with reason host', async () => {
    const id = await live();
    expect(await countSlotHolders(db, org.orgId)).toBe(1);
    expect(await closeListing(db, org.owner.ctx, id, FIXED_NOW)).toEqual({ state: 'closed' });
    expect(await countSlotHolders(db, org.orgId)).toBe(0);
    expect((await row(id)).close_reason).toBe('host');
    const closed = await outboxRows(db, 'test.listing_closed');
    expect(
      closed.find((e) => (e.payload.data as { listingId: string }).listingId === id)?.payload.data,
    ).toMatchObject({ listingId: id, reason: 'host' });
    expect(await auditActions(db, id)).toContain('listings.closed');
    expect((await appError(closeListing(db, org.owner.ctx, id, FIXED_NOW))).code).toBe('conflict');
  });

  it('rejects a pending edit', async () => {
    const id = await live();
    await requestPublish(db, org.owner.ctx, id, [], FIXED_NOW);
    await closeListing(db, org.owner.ctx, id, FIXED_NOW);
    const statuses = await queryRows<{ status: string }>(
      db,
      sql`select status from app.listing_revisions where listing_id = ${id}
        order by revision_number`,
    );
    expect(statuses.map((s) => s.status)).toEqual(['approved', 'rejected']);
  });
});

describe('repostListing', () => {
  it('copies the live content into a draft a year on, opening at Review', async () => {
    const id = await live((c) => {
      c.when.dates = { mode: 'fixed', start: '2026-12-01', end: '2027-03-01' };
      c.applying.questions = [
        { id: 'q_lift', prompt: 'Have you run a lift?', required: true, type: 'yes_no' },
      ];
      c.applying.deadline = '2026-11-20';
    });
    await closeListing(db, org.owner.ctx, id, FIXED_NOW);
    const repost = await repostListing(db, org.owner.ctx, id, new Date('2027-06-01T00:00:00Z'));
    expect(repost.openSection).toBe('review');
    const [draft] = await queryRows<{ draft: ListingContent; reposted_from_id: string }>(
      db,
      sql`select draft, reposted_from_id from app.listings where id = ${repost.id}`,
    );
    expect(draft?.reposted_from_id).toBe(id);
    expect(draft?.draft.when.dates).toEqual({
      mode: 'fixed',
      start: '2027-12-01',
      end: '2028-03-01',
    });
    expect(draft?.draft.applying.deadline).toBe('2027-11-20');
    expect(draft?.draft.applying.questions.map((q) => q.id)).toEqual(['q_lift']);
    expect(draft?.draft.photos.coverMediaId).toBe(fx.coverMediaId);
    expect(draft?.draft.housing).toMatchObject({ photos: fx.housingPhotos });
    expect(await auditActions(db, id)).toContain('listings.reposted');
  });

  it('refuses a removed listing', async () => {
    const id = await live();
    await db.execute(
      sql`update app.listings set state = 'removed', removed_at = now() where id = ${id}`,
    );
    expect((await appError(repostListing(db, org.owner.ctx, id, FIXED_NOW))).code).toBe('conflict');
  });
});

describe('repost reminders', () => {
  const firstPublished = new Date('2026-03-01T18:00:00Z');

  async function lastYearsListing() {
    const id = await live(undefined, firstPublished);
    await closeListing(db, org.owner.ctx, id, firstPublished);
    return id;
  }

  const remindersFor = async (id: string) =>
    (await notificationsOf(db, 'listings.repost_reminder')).filter((n) => n.data.listingId === id);

  it('reminds the owner 8 weeks before the anniversary, once a year', async () => {
    const id = await lastYearsListing();
    await run('listings.repost_reminders', new Date('2027-01-03T15:00:00Z'));
    expect(await remindersFor(id)).toHaveLength(0);
    await run('listings.repost_reminders', new Date('2027-01-04T15:00:00Z'));
    expect((await remindersFor(id)).map((n) => n.user_id)).toEqual([org.owner.userId]);
    expect((await row(id)).repost_reminded_year).toBe(2027);
    await run('listings.repost_reminders', new Date('2027-01-04T15:00:00Z'));
    expect(await remindersFor(id)).toHaveLength(1);
  });

  it("doesn't remind about a listing reposted in the last 12 months", async () => {
    const id = await lastYearsListing();
    const repost = await repostListing(db, org.owner.ctx, id, firstPublished);
    await db.execute(
      sql`update app.listings set created_at = '2026-12-01T00:00:00Z' where id = ${repost.id}`,
    );
    await run('listings.repost_reminders', new Date('2027-01-04T15:00:00Z'));
    expect(await remindersFor(id)).toHaveLength(0);
  });

  it('skips active listings', async () => {
    const id = await live(undefined, firstPublished);
    await run('listings.repost_reminders', new Date('2027-01-04T15:00:00Z'));
    expect(await remindersFor(id)).toHaveLength(0);
  });
});
