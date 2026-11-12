// The screening pipeline (spec section 8.3 steps 2-6): verification, media, the link, the AI
// checks and the decision; plus the photo-slot check and resuming after verification.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { memoryStorage } from '@/modules/media';
import { runCheck } from '@/modules/trust';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { entitlementsFake } from '../../../tests/fakes/sp2/entitlements';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import { verificationFake } from '../../../tests/fakes/sp2/verification';
import { FIXED_NOW, seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import type { ListingContent } from './content';
import { jobHandlers, requestPublish } from './index';
import { photoSlotCheck } from './screening';
import {
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
// The real runCheck, wrapped so one test can script its answer.
vi.mock('@/modules/trust', async (orig) => {
  const real = await orig<typeof import('@/modules/trust')>();
  return { ...real, runCheck: vi.fn(real.runCheck) };
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

const screen = (payload: Record<string, unknown>, now = FIXED_NOW) =>
  jobHandlers['listings.screen']?.(payload, { db, now });

/** A listing with a publish requested; returns its id and the revision being screened. */
async function submitted(edit?: (c: ListingContent) => void) {
  const id = await seedDraftListing(db, org.owner.ctx, fx.content(edit));
  await requestPublish(db, org.owner.ctx, id, [], FIXED_NOW);
  const [rev] = await queryRows<{ id: string }>(
    db,
    sql`select id from app.listing_revisions where listing_id = ${id} order by revision_number desc`,
  );
  if (!rev) throw new Error('no revision');
  return { id, revisionId: rev.id };
}

/** A submitted listing whose publish acknowledged `warnings`. */
async function submittedAcking(warnings: string[]) {
  const id = await seedDraftListing(db, org.owner.ctx, fx.content());
  await requestPublish(db, org.owner.ctx, id, warnings, FIXED_NOW);
  const [rev] = await queryRows<{ id: string }>(
    db,
    sql`select id from app.listing_revisions where listing_id = ${id}`,
  );
  return { id, revisionId: rev?.id ?? '' };
}

async function state(listingId: string, revisionId: string) {
  const [row] = await queryRows<{
    state: string;
    review_stage: string | null;
    status: string;
    checks: Record<string, unknown> | null;
    trust_check_ids: string[];
  }>(
    db,
    sql`select l.state, l.review_stage, r.status, r.checks, r.trust_check_ids
      from app.listings l join app.listing_revisions r on r.listing_id = l.id
      where l.id = ${listingId} and r.id = ${revisionId}`,
  );
  if (!row) throw new Error('no listing');
  return row;
}

const items = (subjectId: string) =>
  queryRows<{ queue: string; reason: string; priority: number; subject_type: string }>(
    db,
    sql`select queue, reason, priority, subject_type from app.review_items
      where subject_id = ${subjectId} order by created_at, id`,
  );

const setMedia = (id: string, status: string) =>
  db.execute(sql`update app.media set status = ${status} where id = ${id}`);

describe('AI checks', () => {
  it('publishes a clean listing', async () => {
    const { id, revisionId } = await submitted();
    await screen({ revisionId, attempt: 0 });
    const s = await state(id, revisionId);
    expect([s.state, s.status, s.review_stage]).toEqual(['active', 'approved', null]);
    expect(s.trust_check_ids).toHaveLength(2);
    expect(s.checks).toMatchObject({ moderation: { decision: 'approved' } });
  });

  it('sends a flagged listing to moderation', async () => {
    const { id, revisionId } = await submitted((c) => {
      c.job.description += ' __flag__';
    });
    await screen({ revisionId, attempt: 0 });
    const s = await state(id, revisionId);
    expect([s.state, s.status, s.review_stage]).toEqual(['in_review', 'in_review', 'moderation']);
    expect(
      (await notificationsOf(db, 'listings.in_review')).map((n) => n.data.listingId),
    ).toContain(id);
    expect((await items(revisionId)).map((i) => i.queue).sort()).toEqual(['fraud', 'moderation']);
  });

  it('returns a blocked listing, and opens a fraud item on the org', async () => {
    const { id, revisionId } = await submitted((c) => {
      c.job.description += ' __block__';
    });
    await screen({ revisionId, attempt: 0 });
    const s = await state(id, revisionId);
    expect([s.state, s.status]).toEqual(['draft', 'rejected']);
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.find((n) => n.data.listingId === id)?.data.reasons).toEqual(['moderation']);
    expect(await items(org.orgId)).toEqual([
      {
        queue: 'fraud',
        reason: 'listing_fraud_rejected',
        priority: 100,
        subject_type: 'organization',
      },
    ]);
  });

  it('does nothing for a revision that is no longer screening', async () => {
    const { id, revisionId } = await submitted();
    await screen({ revisionId, attempt: 0 });
    await screen({ revisionId, attempt: 0 });
    expect((await state(id, revisionId)).status).toBe('approved');
  });
});

describe('media', () => {
  it('waits for a scanning photo, then publishes', async () => {
    const { id, revisionId } = await submitted();
    await setMedia(fx.coverMediaId, 'scanning');
    await screen({ revisionId, attempt: 0 });
    const retry = (await outboxRows(db, 'listings.screen')).find(
      (r) => r.dedupe_key === `screen:${revisionId}:1`,
    );
    expect(retry?.payload).toEqual({ revisionId, attempt: 1 });
    expect(new Date(retry?.available_at ?? '').getTime()).toBe(FIXED_NOW.getTime() + 30_000);
    expect((await state(id, revisionId)).status).toBe('screening');

    await setMedia(fx.coverMediaId, 'approved');
    await screen({ revisionId, attempt: 1 });
    expect((await state(id, revisionId)).state).toBe('active');
  });

  it('gives up on a photo still scanning after 20 tries', async () => {
    const { id, revisionId } = await submitted();
    await setMedia(fx.coverMediaId, 'scanning');
    await screen({ revisionId, attempt: 20 });
    const s = await state(id, revisionId);
    expect([s.status, s.review_stage]).toEqual(['in_review', 'moderation']);
    expect((await items(revisionId)).map((i) => i.reason)).toEqual(['media_timeout']);
  });

  it('waits for a photo held for an operator without timing out', async () => {
    const { id, revisionId } = await submitted();
    await setMedia(fx.housingPhotos.kitchen, 'in_review');
    await screen({ revisionId, attempt: 20 });
    const wait = (await outboxRows(db, 'listings.screen')).find(
      (r) => r.dedupe_key === `screen:${revisionId}:20:w1`,
    );
    expect(wait?.payload).toEqual({ revisionId, attempt: 20, wait: 1 });
    expect(new Date(wait?.available_at ?? '').getTime()).toBe(FIXED_NOW.getTime() + 300_000);
    expect((await state(id, revisionId)).status).toBe('screening');
    expect(await items(revisionId)).toEqual([]);

    await setMedia(fx.housingPhotos.kitchen, 'approved');
    await screen({ revisionId, attempt: 20, wait: 1 });
    expect((await state(id, revisionId)).state).toBe('active');
  });

  it('returns a listing whose photo was rejected', async () => {
    const { id, revisionId } = await submitted();
    await db.execute(
      sql`update app.media set status = 'rejected', rejection_reason = 'unsafe_content'
        where id = ${fx.housingPhotos.bedroom}`,
    );
    await screen({ revisionId, attempt: 0 });
    expect((await state(id, revisionId)).state).toBe('draft');
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.find((n) => n.data.listingId === id)?.data.reasons).toEqual(['photo_rejected']);
  });
});

describe('the Additional step link', () => {
  it('sends an unreachable domain to moderation', async () => {
    const { id, revisionId } = await submitted((c) => {
      c.applying.additionalStep = { url: 'https://down.example/__down__', note: '' };
    });
    await screen({ revisionId, attempt: 0 });
    const [domain] = await queryRows<{ status: string }>(
      db,
      sql`select status from app.link_domains where domain = 'down.example'`,
    );
    expect(domain?.status).toBe('unknown');
    expect((await state(id, revisionId)).review_stage).toBe('moderation');
    expect((await items(revisionId)).map((i) => i.reason)).toEqual(['link_unknown']);
  });

  it('returns a flagged domain', async () => {
    const { id, revisionId } = await submitted((c) => {
      c.applying.additionalStep = { url: 'https://phish.example/__flag__', note: '' };
    });
    await screen({ revisionId, attempt: 0 });
    expect((await state(id, revisionId)).state).toBe('draft');
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.find((n) => n.data.listingId === id)?.data.reasons).toEqual(['link_unsafe']);
  });
});

describe('verification', () => {
  it('starts verification for an unverified org and waits for it', async () => {
    verificationFake.setStatus(org.orgId, 'unverified');
    const { id, revisionId } = await submitted();
    await screen({ revisionId, attempt: 0 });
    expect(verificationFake.calls.find((c) => c.name === 'startVerification')?.args).toEqual([
      org.orgId,
      id,
    ]);
    const s = await state(id, revisionId);
    expect([s.state, s.review_stage, s.status]).toEqual(['in_review', 'verification', 'screening']);
  });

  it('resumes screening once verified', async () => {
    verificationFake.setStatus(org.orgId, 'running');
    const { id, revisionId } = await submitted();
    await screen({ revisionId, attempt: 0 });
    expect((await state(id, revisionId)).review_stage).toBe('verification');

    verificationFake.setStatus(org.orgId, 'verified');
    await jobHandlers['listings.resume_screening']?.(
      {
        event: 'verification.decided',
        eventId: 'ev-1',
        data: { orgId: org.orgId, status: 'verified' },
      },
      { db, now: FIXED_NOW },
    );
    const resumed = (await outboxRows(db, 'listings.screen')).find(
      (r) => r.dedupe_key === `screen:${revisionId}:ev-1`,
    );
    expect(resumed?.payload).toEqual({ revisionId, attempt: 0 });
    expect((await state(id, revisionId)).review_stage).toBe('screening');
  });

  it('returns the listing when verification failed', async () => {
    verificationFake.setStatus(org.orgId, 'running');
    const { id, revisionId } = await submitted();
    await screen({ revisionId, attempt: 0 });
    await jobHandlers['listings.resume_screening']?.(
      {
        event: 'verification.decided',
        eventId: 'ev-2',
        data: { orgId: org.orgId, status: 'failed' },
      },
      { db, now: FIXED_NOW },
    );
    expect((await state(id, revisionId)).state).toBe('draft');
    const returned = await notificationsOf(db, 'listings.returned');
    expect(returned.find((n) => n.data.listingId === id)?.data.reasons).toEqual([
      'verification_failed',
    ]);
  });
});

it('sends a kept photo mismatch to moderation', async () => {
  await db.execute(sql`
    insert into app.photo_slot_checks (media_id, slot, result)
    values (${fx.housingPhotos.bathroom}, 'bathroom', 'mismatch')
  `);
  const { id, revisionId } = await submittedAcking(['photo_slot_mismatch:bathroom']);
  await screen({ revisionId, attempt: 0 });
  const s = await state(id, revisionId);
  expect([s.status, s.review_stage]).toEqual(['in_review', 'moderation']);
  expect((await items(revisionId)).map((i) => i.reason)).toEqual(['photo_slot_mismatch_kept']);
});

describe('photoSlotCheck', () => {
  async function stored(mediaId: string) {
    const storage = memoryStorage();
    await storage.write(
      'media-public',
      `${mediaId}/640.webp`,
      new Uint8Array([1, 2, 3]),
      'image/webp',
    );
    return storage;
  }

  const slotRow = async (mediaId: string) =>
    (
      await queryRows<{ result: string }>(
        db,
        sql`select result from app.photo_slot_checks where media_id = ${mediaId}`,
      )
    )[0]?.result;

  it('records a mismatch, a match and an error', async () => {
    const mediaId = fx.housingPhotos.bathroom;
    const storage = await stored(mediaId);
    const answer = (decision: 'approved' | 'rejected' | 'needs_review', reason = 'stub') => ({
      checkId: '00000000-0000-7000-8000-000000000001',
      decision,
      score: decision === 'rejected' ? 0.9 : 0.1,
      labels: [],
      reason,
    });

    vi.mocked(runCheck).mockResolvedValueOnce(answer('rejected'));
    await photoSlotCheck(db, { mediaId, slot: 'bathroom', listingId: 'x' }, FIXED_NOW, { storage });
    expect(await slotRow(mediaId)).toBe('mismatch');
    expect(vi.mocked(runCheck).mock.lastCall?.[1]).toMatchObject({
      kind: 'photo_slot',
      reviewQueue: null,
      subjectType: 'media',
      subjectId: mediaId,
      text: 'Bathroom',
    });

    vi.mocked(runCheck).mockResolvedValueOnce(answer('approved'));
    await photoSlotCheck(db, { mediaId, slot: 'bathroom', listingId: 'x' }, FIXED_NOW, { storage });
    expect(await slotRow(mediaId)).toBe('match');

    vi.mocked(runCheck).mockResolvedValueOnce(answer('needs_review', 'classifier_error'));
    await photoSlotCheck(db, { mediaId, slot: 'bathroom', listingId: 'x' }, FIXED_NOW, { storage });
    expect(await slotRow(mediaId)).toBe('error');
  });

  it('waits for a photo that is still scanning', async () => {
    const mediaId = fx.housingPhotos.exterior;
    await setMedia(mediaId, 'scanning');
    await photoSlotCheck(db, { mediaId, slot: 'exterior', listingId: 'x' }, FIXED_NOW, {
      storage: memoryStorage(),
    });
    expect(
      (await outboxRows(db, 'listings.photo_slot_check')).find(
        (r) => r.dedupe_key === `slot:${mediaId}:exterior:1`,
      )?.payload,
    ).toEqual({ mediaId, slot: 'exterior', listingId: 'x', attempt: 1 });
    expect(await slotRow(mediaId)).toBeUndefined();
  });
});
