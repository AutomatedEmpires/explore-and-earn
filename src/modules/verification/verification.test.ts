// Business verification runs and decisions (SP2 spec 8.4 and section 6): auto-verify only with a
// low score, no hard flags and a card; everything else goes to the fraud queue; never
// auto-rejected (failure mode 4). Sibling SP2 modules are W0 fakes; trust, notifications, jobs,
// audit and settings are real.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassifierError, type ClassifyOptions } from '@/lib/ai';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { decide, openReviewItem } from '@/modules/trust';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW, seedHostOrg, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import {
  VERIFYING_COPY,
  getVerificationDetails,
  getVerificationStatus,
  jobHandlers,
  openVerificationAppeal,
  privacyHandlers,
  requestReverification,
  runVerification,
  startVerification,
  submitVerificationInfo,
  type SignalDeps,
} from './index';

const ai = vi.hoisted(() => ({
  override: null as null | ((o: ClassifyOptions<unknown>) => Promise<unknown>),
}));

vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return {
    ...actual,
    classify: vi.fn((o: ClassifyOptions<unknown>) =>
      ai.override ? ai.override(o) : actual.classify(o),
    ),
  };
});
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/billing', async (orig) => ({
  ...(await orig<typeof import('@/modules/billing')>()),
  ...(await import('../../../tests/fakes/sp2/billing')).billingFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));

let t: TestDb;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  operatorId = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${operatorId}, ${`user_${operatorId}`}, ${`${operatorId}@ops.test`}, 'Operator', 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${operatorId}, 'owner', '{}'::text[], 'on_shift')
  `);
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  ai.override = null;
  billingFake.reset();
  locationsFake.reset();
});

type Row = {
  id: string;
  status: string;
  trigger_listing_id: string | null;
  check_id: string | null;
  review_item_id: string | null;
  decided_by: string | null;
  info_request: string | null;
  info_response: string | null;
  info_website_url: string | null;
  signals: unknown;
};

type Item = {
  id: string;
  queue: string;
  reason: string;
  priority: number;
  status: string;
  original_item_id: string | null;
  check_id: string | null;
};

const runs = (orgId: string) =>
  queryRows<Row>(
    t.db,
    sql`select * from app.business_verifications where org_id = ${orgId} order by created_at, id`,
  );

const items = (orgId: string) =>
  queryRows<Item>(
    t.db,
    sql`select * from app.review_items where subject_type = 'organization'
      and subject_id = ${orgId} order by created_at, id`,
  );

const orgStatus = async (orgId: string) =>
  (
    await queryRows<{ verification_status: string; verified_at: string | null }>(
      t.db,
      sql`select verification_status, verified_at from app.organizations where id = ${orgId}`,
    )
  )[0];

const decidedEvents = (orgId: string) =>
  queryRows<{ topic: string; status: string }>(
    t.db,
    sql`select topic, payload->'data'->>'status' as status from app.outbox
      where payload->>'event' = 'verification.decided' and payload->'data'->>'orgId' = ${orgId}
      order by created_at, id`,
  );

const auditActions = async (orgId: string) =>
  (
    await queryRows<{ action: string }>(
      t.db,
      sql`select action from app.audit_events where org_id = ${orgId} order by created_at, id`,
    )
  ).map((r) => r.action);

const notificationsFor = (userId: string) =>
  queryRows<{ type: string; title: string; body: string }>(
    t.db,
    sql`select type, title, body from app.notifications where user_id = ${userId}
      order by created_at, id`,
  );

function signalDeps(o: { websiteText?: string } = {}): SignalDeps {
  return {
    fetchText: async (url) => ({
      status: 200,
      finalUrl: url,
      text: o.websiteText ?? 'Kettle Ridge Lodge, a family lodge in the Cascades since 1987',
    }),
    rdapRegisteredAt: async () => new Date('2015-03-01T00:00:00Z'),
    now: FIXED_NOW,
  };
}

const short = () => newId().replace(/-/g, '').slice(-8);

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

async function seedOrg(o: { email?: string; website?: string } = {}): Promise<SeededOrg> {
  const org = await seedHostOrg(t.db, { ownerEmail: o.email ?? `sam@kettle-${short()}.com` });
  if (o.website) {
    await t.db.execute(
      sql`update app.organizations set website_url = ${o.website} where id = ${org.orgId}`,
    );
  }
  locationsFake.setLocation({ id: newId(), orgId: org.orgId, state: 'WA' });
  return org;
}

/** Starts a run for `orgId` and runs it with `deps`; returns the run's row afterwards. */
async function verify(orgId: string, deps: SignalDeps = signalDeps()): Promise<Row> {
  await startVerification(t.db, orgId, newId());
  const open = (await runs(orgId)).filter((r) => r.status === 'running');
  expect(open).toHaveLength(1);
  await runVerification(t.db, must(open[0]).id, deps);
  return must((await runs(orgId)).find((r) => r.id === must(open[0]).id));
}

describe('startVerification', () => {
  it('inserts a running row, marks the org running, enqueues the run and records it', async () => {
    const { orgId } = await seedOrg();
    const listingId = newId();
    await startVerification(t.db, orgId, listingId);
    await startVerification(t.db, orgId, newId());

    const rows = await runs(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'running', trigger_listing_id: listingId });
    expect((await orgStatus(orgId))?.verification_status).toBe('running');
    expect(await getVerificationStatus(t.db, orgId)).toBe('running');

    const jobs = await queryRows<{ dedupe_key: string; verification_id: string }>(
      t.db,
      sql`select dedupe_key, payload->>'verificationId' as verification_id from app.outbox
        where topic = 'verification.run' and payload->>'verificationId' = ${must(rows[0]).id}`,
    );
    expect(jobs).toEqual([{ dedupe_key: `verify:${must(rows[0]).id}`, verification_id: must(rows[0]).id }]);
    expect(await auditActions(orgId)).toEqual(['verification.started']);
  });

  it('re-announces the decision instead of starting over for a decided org', async () => {
    const { orgId } = await seedOrg();
    await verify(orgId);
    expect(await decidedEvents(orgId)).toHaveLength(1);

    await startVerification(t.db, orgId, newId());
    expect(await runs(orgId)).toHaveLength(1);
    expect((await decidedEvents(orgId)).map((e) => e.status)).toEqual(['verified', 'verified']);
  });
});

describe('the verification.run job', () => {
  it('verifies a clean org with a card automatically', async () => {
    const org = await seedOrg({ website: 'https://www.kettle-lodge.com' });
    const row = await verify(org.orgId);

    expect(row).toMatchObject({ status: 'verified', decided_by: 'auto', review_item_id: null });
    expect(row.check_id).not.toBeNull();
    expect(row.signals).toMatchObject({ hasCard: true, websiteReachable: true, locationInUs: true });
    expect(
      await queryRows(
        t.db,
        sql`select kind, subject_type, prompt_version from app.trust_checks
          where id = ${row.check_id}::uuid`,
      ),
    ).toEqual([
      {
        kind: 'business_verification',
        subject_type: 'organization',
        prompt_version: 'business_verification@1',
      },
    ]);
    expect(await orgStatus(org.orgId)).toMatchObject({ verification_status: 'verified' });
    expect((await orgStatus(org.orgId))?.verified_at).not.toBeNull();
    expect(await decidedEvents(org.orgId)).toEqual([
      { topic: 'listings.resume_screening', status: 'verified' },
    ]);
    expect(await auditActions(org.orgId)).toEqual(['verification.started', 'verification.decided']);
    expect(await items(org.orgId)).toHaveLength(0);
    expect(await notificationsFor(org.owner.userId)).toEqual([
      expect.objectContaining({ type: 'verification.decided', title: 'Your business is verified' }),
    ]);
  });

  it('runs through the worker with the default signal sources', async () => {
    // A `.test` email and no website: nothing is fetched over the network.
    const org = await seedHostOrg(t.db, { ownerEmail: `sam-${short()}@kettle.test` });
    // Only this org's run: earlier tests left runs whose owners have real-looking domains.
    await t.db.execute(sql`delete from app.outbox where topic = 'verification.run'`);
    await startVerification(t.db, org.orgId, newId());
    await runWorker(t.db, { handlers: { 'verification.run': must(jobHandlers['verification.run']) } });
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('verified');
  });

  it('sends an org with no card on file to the fraud queue', async () => {
    const { orgId } = await seedOrg();
    billingFake.setCardChecks(orgId, { hasCard: false, cvcCheck: null, postalCheck: null });
    const row = await verify(orgId);

    const found = await items(orgId);
    expect(found).toEqual([expect.objectContaining({ queue: 'fraud', reason: 'no_card' })]);
    expect(row).toMatchObject({ status: 'needs_review', review_item_id: must(found[0]).id });
    expect(await getVerificationStatus(t.db, orgId)).toBe('needs_review');
    expect(await decidedEvents(orgId)).toHaveLength(0);
  });

  it('opens its own priority-100 item for hard flags and runs the check without a queue', async () => {
    const { orgId } = await seedOrg({
      email: `x${short()}@mailinator.com`,
      website: 'https://x-lodge.com',
    });
    // An uncertain score would open a second item if the check had a review queue.
    const row = await verify(orgId, signalDeps({ websiteText: 'Hiring now __flag__' }));

    const found = await items(orgId);
    expect(found).toEqual([
      expect.objectContaining({
        queue: 'fraud',
        priority: 100,
        reason: 'hard_flags:disposable_email',
        check_id: row.check_id,
      }),
    ]);
    expect(row).toMatchObject({ status: 'needs_review', review_item_id: must(found[0]).id });
    expect(await getVerificationStatus(t.db, orgId)).toBe('needs_review');
  });

  it('(failure mode 4) sends a classifier failure to review, never to failed', async () => {
    ai.override = async () => {
      throw new ClassifierError('timeout', 'Classifier timed out');
    };
    const { orgId } = await seedOrg();
    const row = await verify(orgId);

    expect(row.status).toBe('needs_review');
    expect(await items(orgId)).toEqual([
      expect.objectContaining({ queue: 'fraud', reason: 'classifier_error' }),
    ]);
    expect(row.review_item_id).toBe(must((await items(orgId))[0]).id);
    expect(await getVerificationDetails(t.db, orgId)).toEqual({
      status: 'needs_review',
      infoRequest: null,
    });
  });

  it('never auto-rejects, even a high score', async () => {
    const { orgId } = await seedOrg({ website: 'https://scam-lodge.com' });
    const row = await verify(orgId, signalDeps({ websiteText: 'Send a deposit __block__' }));
    expect(row.status).toBe('needs_review');
    expect(await getVerificationStatus(t.db, orgId)).toBe('needs_review');
    expect(await items(orgId)).toEqual([expect.objectContaining({ queue: 'fraud' })]);
  });

  it('does nothing for a run that is no longer running', async () => {
    const { orgId } = await seedOrg();
    const row = await verify(orgId);
    await runVerification(t.db, row.id, signalDeps());
    expect(await decidedEvents(orgId)).toHaveLength(1);
    await runVerification(t.db, newId(), signalDeps());
  });

  it('uses the exact copy hosts see while a review is pending', () => {
    expect(VERIFYING_COPY).toBe("We're verifying your business. This usually takes a few hours.");
  });
});

describe('operator decisions (subject organization)', () => {
  async function inReview(): Promise<{ org: SeededOrg; row: Row }> {
    const org = await seedOrg();
    billingFake.setCardChecks(org.orgId, { hasCard: false, cvcCheck: null, postalCheck: null });
    const row = await verify(org.orgId);
    expect(row.status).toBe('needs_review');
    return { org, row };
  }

  it('approve verifies the business', async () => {
    const { org, row } = await inReview();
    await decide(t.db, must(row.review_item_id), operatorId, 'approve');

    const [after] = await runs(org.orgId);
    expect(after).toMatchObject({ status: 'verified', decided_by: 'operator' });
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('verified');
    expect(await decidedEvents(org.orgId)).toEqual([
      expect.objectContaining({ status: 'verified' }),
    ]);
    expect(await auditActions(org.orgId)).toContain('verification.decided');
  });

  it('approve waits while another item on the org is still open', async () => {
    const { org, row } = await inReview();
    const other = await openReviewItem(t.db, {
      queue: 'fraud',
      subjectType: 'organization',
      subjectId: org.orgId,
      reason: 'listing_fraud_rejected',
      priority: 100,
    });

    await decide(t.db, must(row.review_item_id), operatorId, 'approve');
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('needs_review');

    await decide(t.db, other.id, operatorId, 'approve');
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('verified');
    expect((await runs(org.orgId))[0]).toMatchObject({
      status: 'verified',
      review_item_id: other.id,
    });
  });

  it('remove fails the verification and announces it to the owner and admins', async () => {
    const { org, row } = await inReview();
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await decide(t.db, must(row.review_item_id), operatorId, 'remove');

    expect((await runs(org.orgId))[0]).toMatchObject({ status: 'failed', decided_by: 'operator' });
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('failed');
    expect(await decidedEvents(org.orgId)).toEqual([
      { topic: 'listings.resume_screening', status: 'failed' },
    ]);
    for (const userId of [org.owner.userId, admin.userId]) {
      expect(await notificationsFor(userId)).toEqual([
        expect.objectContaining({
          type: 'verification.decided',
          title: "We couldn't verify your business",
        }),
      ]);
    }
    expect(await notificationsFor(recruiter.userId)).toEqual([]);
  });

  it('ask_info asks the owner and admins for more information', async () => {
    const { org, row } = await inReview();
    await decide(t.db, must(row.review_item_id), operatorId, 'ask_info', {
      note: 'Please share a link to your business license.',
    });

    expect((await runs(org.orgId))[0]).toMatchObject({
      status: 'needs_info',
      info_request: 'Please share a link to your business license.',
    });
    expect(await getVerificationDetails(t.db, org.orgId)).toEqual({
      status: 'needs_info',
      infoRequest: 'Please share a link to your business license.',
    });
    const notes = await notificationsFor(org.owner.userId);
    expect(notes).toEqual([expect.objectContaining({ type: 'verification.needs_info' })]);
    expect(notes[0]?.body).toContain('Please share a link to your business license.');
    expect(await decidedEvents(org.orgId)).toEqual([
      expect.objectContaining({ status: 'needs_info' }),
    ]);
  });

  it('ask_info needs a note', async () => {
    const { row } = await inReview();
    await expect(decide(t.db, must(row.review_item_id), operatorId, 'ask_info')).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('suspend and ban sanction the org through billing', async () => {
    const { org, row } = await inReview();
    await decide(t.db, must(row.review_item_id), operatorId, 'suspend');
    expect(billingFake.callsTo('sanctionOrg')).toEqual([
      [org.orgId, 'suspend', { type: 'operator', id: null }],
    ]);
  });
});

describe('submitVerificationInfo', () => {
  it('answers an info request and sends it back to the fraud queue', async () => {
    const org = await seedOrg();
    billingFake.setCardChecks(org.orgId, { hasCard: false, cvcCheck: null, postalCheck: null });
    const row = await verify(org.orgId);
    await decide(t.db, must(row.review_item_id), operatorId, 'ask_info', { note: 'Your license?' });

    await expect(
      submitVerificationInfo(t.db, org.owner.ctx, { text: 'x'.repeat(2001) }),
    ).rejects.toMatchObject({ code: 'bad_request' });

    const out = await submitVerificationInfo(t.db, org.owner.ctx, {
      text: 'License 12-345, issued by Chelan County.',
      websiteUrl: 'https://kettle-lodge.com',
    });
    expect(out).toEqual({ status: 'needs_review' });

    const [after] = await runs(org.orgId);
    const info = (await items(org.orgId)).filter((i) => i.reason === 'info_provided');
    expect(info).toEqual([expect.objectContaining({ queue: 'fraud', status: 'assigned' })]);
    expect(after).toMatchObject({
      status: 'needs_review',
      info_response: 'License 12-345, issued by Chelan County.',
      info_website_url: 'https://kettle-lodge.com',
      review_item_id: must(info[0]).id,
    });
    expect(await getVerificationDetails(t.db, org.orgId)).toEqual({
      status: 'needs_review',
      infoRequest: null,
    });

    // Approving the answer verifies the business.
    await decide(t.db, must(info[0]).id, operatorId, 'approve');
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('verified');
  });

  it('refuses an answer nobody asked for, and a role that cannot manage the org', async () => {
    const org = await seedOrg();
    await expect(
      submitVerificationInfo(t.db, org.owner.ctx, { text: 'Hello' }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'not_waiting_for_info' } });

    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(
      submitVerificationInfo(t.db, recruiter.ctx, { text: 'Hello' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('requestReverification', () => {
  it('re-runs a verified org without lowering it when a new hard flag appears', async () => {
    const { orgId } = await seedOrg();
    await verify(orgId);
    expect(await getVerificationStatus(t.db, orgId)).toBe('verified');

    billingFake.setCardChecks(orgId, { hasCard: true, cvcCheck: 'fail', postalCheck: 'pass' });
    await requestReverification(t.db, orgId);
    await requestReverification(t.db, orgId);
    const rerun = (await runs(orgId)).filter((r) => r.status === 'running');
    expect(rerun).toEqual([expect.objectContaining({ trigger_listing_id: null })]);
    expect(await getVerificationStatus(t.db, orgId)).toBe('verified');

    await runVerification(t.db, must(rerun[0]).id, signalDeps());
    expect(await items(orgId)).toEqual([
      expect.objectContaining({ queue: 'fraud', priority: 100, reason: 'hard_flags:cvc_failed' }),
    ]);
    expect((await runs(orgId)).at(-1)?.status).toBe('needs_review');
    expect(await getVerificationStatus(t.db, orgId)).toBe('verified');
  });

  it('does nothing for an org that was never verified or has failed', async () => {
    const { orgId } = await seedOrg();
    await requestReverification(t.db, orgId);
    expect(await runs(orgId)).toHaveLength(0);
    expect(await getVerificationStatus(t.db, orgId)).toBe('unverified');
  });
});

describe('openVerificationAppeal', () => {
  it('appeals the decision that failed the verification', async () => {
    const org = await seedOrg();
    billingFake.setCardChecks(org.orgId, { hasCard: false, cvcCheck: null, postalCheck: null });
    const row = await verify(org.orgId);
    await decide(t.db, must(row.review_item_id), operatorId, 'remove');

    await openVerificationAppeal(t.db, org.orgId, 'We are a real lodge. Here is our license.');
    const appeals = (await items(org.orgId)).filter((i) => i.queue === 'appeals');
    expect(appeals).toEqual([
      expect.objectContaining({
        original_item_id: row.review_item_id,
        reason: 'We are a real lodge. Here is our license.',
      }),
    ]);

    // Granting the appeal verifies the business.
    await decide(t.db, must(appeals[0]).id, operatorId, 'approve');
    expect(await getVerificationStatus(t.db, org.orgId)).toBe('verified');
  });

  it('refuses an appeal when the verification has not failed', async () => {
    const { orgId } = await seedOrg();
    await verify(orgId);
    await expect(openVerificationAppeal(t.db, orgId, 'Please look again')).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});

describe('privacyHandlers', () => {
  it('holds no personal data keyed by user', async () => {
    const org = await seedOrg();
    expect(await privacyHandlers.export(t.db, org.owner.userId)).toEqual({});
    await expect(privacyHandlers.erase(t.db, org.owner.userId)).resolves.toBeUndefined();
  });
});
