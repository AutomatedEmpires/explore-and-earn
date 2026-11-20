// Versioned legal documents (SP8 plan Task 24, spec 8.5): the counsel lifecycle, the 30-day
// notice period for a material change, the publish job that supersedes the previous version,
// the legal.updated notification chunks and the cookie-consent epoch. On PGlite.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
// Loading the content module registers the Cookie Policy date with privacy.
import '@/modules/content';
import { consentForUser } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator, seedSeeker } from '@tests/helpers/sp8';
import { getConsentNotBefore, resetConsentEpochCache } from './consent-epoch';
import {
  getLegalVersion,
  getPublishedLegal,
  LEGAL_SLUGS,
  LEGAL_TITLES,
  listLegalDocumentsForConsole,
  listLegalVersions,
  ONBOARDING_LEGAL,
  publishDueLegal,
  recordCounselApproval,
  saveLegalDraft,
  scheduleLegal,
  type LegalSlug,
} from './legal';
import { LEGAL_NOTIFY_TOPIC, legalJobHandlers } from './legal-jobs';

const NOW = new Date('2026-12-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let t: TestDb;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  ({ userId: operatorId } = await seedOperator(t.db, { role: 'owner' }));
});

afterAll(async () => {
  await t.close();
});

afterEach(() => {
  resetConsentEpochCache();
});

async function codeOf(p: Promise<unknown>): Promise<{ code: string; reason: unknown }> {
  try {
    await p;
  } catch (err) {
    if (isAppError(err)) {
      const details = err.details as { reason?: unknown } | undefined;
      return { code: err.code, reason: details?.reason };
    }
    throw err;
  }
  throw new Error('expected an AppError');
}

async function draft(
  db: Db,
  slug: LegalSlug,
  o: { material?: boolean; submit?: boolean; body?: string } = {},
): Promise<{ id: string; version: number }> {
  return saveLegalDraft(db, {
    slug,
    title: LEGAL_TITLES[slug],
    bodyMd: o.body ?? `The ${slug} text.`,
    summaryOfChanges: 'What changed.',
    counselQuestions: '- A question for counsel.',
    material: o.material ?? true,
    submitForCounsel: o.submit ?? true,
    operatorId,
  });
}

/** A version through counsel review and approval, ready to schedule. */
async function approved(
  db: Db,
  slug: LegalSlug,
  o: { material?: boolean; body?: string } = {},
): Promise<{ id: string; version: number }> {
  const doc = await draft(db, slug, { ...o, submit: true });
  await recordCounselApproval(db, { documentId: doc.id, note: 'Counsel signed this.', operatorId });
  return doc;
}

async function statuses(db: Db, slug: LegalSlug): Promise<Record<number, string>> {
  const rows = await queryRows<{ version: number; status: string }>(
    db,
    sql`select version, status from app.legal_documents where slug = ${slug} order by version`,
  );
  return Object.fromEntries(rows.map((r) => [r.version, r.status]));
}

async function auditActions(db: Db, documentId: string): Promise<string[]> {
  const rows = await queryRows<{ action: string }>(
    db,
    sql`select action from app.audit_events where subject_id = ${documentId} order by id`,
  );
  return rows.map((r) => r.action);
}

describe('the legal registry', () => {
  it('lists the eight documents in spec order with their titles', () => {
    expect(LEGAL_SLUGS).toEqual([
      'terms',
      'host-terms',
      'privacy',
      'cookies',
      'community',
      'fit-score',
      'international',
      'subprocessors',
    ]);
    expect(LEGAL_TITLES).toEqual({
      terms: 'Terms of Service',
      'host-terms': 'Host Terms',
      privacy: 'Privacy Policy',
      cookies: 'Cookie Policy',
      community: 'Community Guidelines',
      'fit-score': 'Fit score notice',
      international: 'Working in the US from abroad',
      subprocessors: 'Subprocessors',
    });
    expect(ONBOARDING_LEGAL).toEqual({
      seeker: ['terms', 'privacy', 'community'],
      host: ['terms', 'host-terms', 'privacy'],
    });
  });
});

describe('the counsel lifecycle', () => {
  it('moves draft -> counsel_review -> approved and publishes a first version at once', async () => {
    const first = await draft(t.db, 'terms', { submit: false, material: false });
    expect(first).toEqual({ id: expect.any(String), version: 1 });
    expect(await statuses(t.db, 'terms')).toEqual({ 1: 'draft' });

    // Saving again edits the same draft. Version 1 is always material.
    const again = await draft(t.db, 'terms', { submit: false, body: 'Edited.', material: false });
    expect(again).toEqual(first);
    const [row] = await queryRows<{ body_md: string; material: boolean }>(
      t.db,
      sql`select body_md, material from app.legal_documents where id = ${first.id}`,
    );
    expect(row).toEqual({ body_md: 'Edited.', material: true });

    // A draft cannot be approved or scheduled.
    expect(
      await codeOf(
        recordCounselApproval(t.db, { documentId: first.id, note: 'Fine.', operatorId }),
      ),
    ).toMatchObject({ code: 'conflict' });
    expect(
      await codeOf(
        scheduleLegal(t.db, { documentId: first.id, effectiveAt: NOW, operatorId, now: NOW }),
      ),
    ).toMatchObject({ code: 'conflict', reason: 'not_approved' });

    await draft(t.db, 'terms', { submit: true });
    expect(await statuses(t.db, 'terms')).toEqual({ 1: 'counsel_review' });
    // A version with counsel is not edited by a later save.
    expect(await codeOf(draft(t.db, 'terms'))).toEqual({
      code: 'conflict',
      reason: 'not_editable',
    });

    expect(
      await codeOf(recordCounselApproval(t.db, { documentId: first.id, note: 'ok', operatorId })),
    ).toMatchObject({ code: 'bad_request' });
    await recordCounselApproval(t.db, {
      documentId: first.id,
      note: 'Counsel signed this.',
      operatorId,
    });
    expect(await statuses(t.db, 'terms')).toEqual({ 1: 'approved' });
    expect(await getPublishedLegal(t.db, 'terms')).toBeNull();

    // The first version takes effect when it is published, whatever date is asked for.
    await scheduleLegal(t.db, {
      documentId: first.id,
      effectiveAt: new Date(NOW.getTime() + 90 * DAY),
      operatorId,
      now: NOW,
    });
    expect(await statuses(t.db, 'terms')).toEqual({ 1: 'published' });
    expect(await getPublishedLegal(t.db, 'terms')).toEqual({
      slug: 'terms',
      version: 1,
      title: 'Terms of Service',
      bodyMd: 'The terms text.',
      effectiveAt: NOW,
    });
    expect(await auditActions(t.db, first.id)).toEqual([
      'content.legal_counsel_approved',
      'content.legal_published',
    ]);
    const [dates] = await queryRows<{ effective_at: string; published_at: string; note: string }>(
      t.db,
      sql`select effective_at::text, published_at::text, counsel_note as note
          from app.legal_documents where id = ${first.id}`,
    );
    expect(dates?.effective_at).toBe(dates?.published_at);
    expect(dates?.note).toBe('Counsel signed this.');
  });

  it('holds a material change for 30 days, then supersedes the previous version', async () => {
    const v1 = await approved(t.db, 'privacy');
    await scheduleLegal(t.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });

    const v2 = await approved(t.db, 'privacy', { body: 'Version two.' });
    expect(v2.version).toBe(2);
    expect(
      await codeOf(
        scheduleLegal(t.db, {
          documentId: v2.id,
          effectiveAt: new Date(NOW.getTime() + 29 * DAY),
          operatorId,
          now: NOW,
        }),
      ),
    ).toEqual({ code: 'bad_request', reason: 'notice_period' });

    const effective = new Date(NOW.getTime() + 30 * DAY);
    await scheduleLegal(t.db, { documentId: v2.id, effectiveAt: effective, operatorId, now: NOW });
    expect(await statuses(t.db, 'privacy')).toEqual({ 1: 'published', 2: 'scheduled' });
    expect(await auditActions(t.db, v2.id)).toEqual([
      'content.legal_counsel_approved',
      'content.legal_scheduled',
    ]);
    // Scheduling a material version starts the legal.updated notices.
    const jobs = await queryRows<{ payload: unknown }>(
      t.db,
      sql`select payload from app.outbox where topic = ${LEGAL_NOTIFY_TOPIC}
          and payload->>'documentId' = ${v2.id}`,
    );
    expect(jobs).toEqual([{ payload: { documentId: v2.id, afterUserId: null } }]);

    // A second version cannot be scheduled while one is waiting.
    const v3 = await approved(t.db, 'privacy', { material: false });
    expect(
      await codeOf(
        scheduleLegal(t.db, { documentId: v3.id, effectiveAt: effective, operatorId, now: NOW }),
      ),
    ).toEqual({ code: 'conflict', reason: 'already_scheduled' });

    // Not yet due.
    expect(await publishDueLegal(t.db, new Date(effective.getTime() - 1))).toBe(0);
    expect((await getPublishedLegal(t.db, 'privacy'))?.version).toBe(1);

    expect(await publishDueLegal(t.db, effective)).toBe(1);
    expect(await statuses(t.db, 'privacy')).toEqual({
      1: 'superseded',
      2: 'published',
      3: 'approved',
    });
    expect(await getPublishedLegal(t.db, 'privacy')).toMatchObject({
      version: 2,
      bodyMd: 'Version two.',
      effectiveAt: effective,
    });
    const published = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.legal_documents
          where slug = 'privacy' and status = 'published'`,
    );
    expect(published).toEqual([{ n: 1 }]);

    // A change that isn't material may take effect at once, never in the past.
    expect(
      await codeOf(
        scheduleLegal(t.db, {
          documentId: v3.id,
          effectiveAt: new Date(effective.getTime() - 1),
          operatorId,
          now: effective,
        }),
      ),
    ).toMatchObject({ code: 'bad_request' });
    await scheduleLegal(t.db, {
      documentId: v3.id,
      effectiveAt: effective,
      operatorId,
      now: effective,
    });
    expect(await publishDueLegal(t.db, effective)).toBe(1);
    expect(await statuses(t.db, 'privacy')).toEqual({
      1: 'superseded',
      2: 'superseded',
      3: 'published',
    });
    expect(await listLegalVersions(t.db, 'privacy')).toEqual([
      { version: 3, title: 'Privacy Policy', effectiveAt: effective, status: 'published' },
      { version: 2, title: 'Privacy Policy', effectiveAt: effective, status: 'superseded' },
      { version: 1, title: 'Privacy Policy', effectiveAt: NOW, status: 'superseded' },
    ]);
    expect(await getLegalVersion(t.db, 'privacy', 2)).toMatchObject({
      version: 2,
      bodyMd: 'Version two.',
    });
  });

  it('runs the publish job from the legal_effective topic', async () => {
    const v1 = await approved(t.db, 'host-terms');
    await scheduleLegal(t.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
    const v2 = await approved(t.db, 'host-terms', { material: false });
    const at = new Date(NOW.getTime() + DAY);
    await scheduleLegal(t.db, { documentId: v2.id, effectiveAt: at, operatorId, now: NOW });

    const handler = legalJobHandlers['content.legal_effective'];
    if (!handler) throw new Error('no content.legal_effective handler');
    await handler({}, { db: t.db, now: at });
    expect(await statuses(t.db, 'host-terms')).toEqual({ 1: 'superseded', 2: 'published' });
  });

  it('never serves a draft, a document with counsel or an approved version as published', async () => {
    const doc = await draft(t.db, 'fit-score', { submit: false });
    expect(await getPublishedLegal(t.db, 'fit-score')).toBeNull();
    expect(await getLegalVersion(t.db, 'fit-score', doc.version)).toBeNull();
    expect(await listLegalVersions(t.db, 'fit-score')).toEqual([]);
    await draft(t.db, 'fit-score', { submit: true });
    expect(await getLegalVersion(t.db, 'fit-score', doc.version)).toBeNull();
    await recordCounselApproval(t.db, { documentId: doc.id, note: 'Counsel signed.', operatorId });
    expect(await getPublishedLegal(t.db, 'fit-score')).toBeNull();
    expect(await getLegalVersion(t.db, 'fit-score', doc.version)).toBeNull();

    const console = await listLegalDocumentsForConsole(t.db);
    expect(console.find((row) => row.id === doc.id)).toMatchObject({
      slug: 'fit-score',
      version: 1,
      status: 'approved',
      counselNote: 'Counsel signed.',
      counselQuestions: '- A question for counsel.',
    });
  });
});

/** Runs every pending legal_notify_chunk job once, as the worker would, and counts them. */
async function drainNotifyChunks(db: Db): Promise<number> {
  const handler = legalJobHandlers[LEGAL_NOTIFY_TOPIC];
  if (!handler) throw new Error('no notify handler');
  let ran = 0;
  for (;;) {
    const [job] = await queryRows<{ id: string; payload: unknown }>(
      db,
      sql`select id, payload from app.outbox
          where topic = ${LEGAL_NOTIFY_TOPIC} and status = 'pending' order by created_at, id limit 1`,
    );
    if (!job) return ran;
    await handler(job.payload, { db, now: NOW });
    await db.execute(sql`update app.outbox set status = 'done' where id = ${job.id}`);
    ran += 1;
  }
}

async function legalUpdates(
  db: Db,
  slug: LegalSlug,
): Promise<{ account_type: string; n: number }[]> {
  return queryRows<{ account_type: string; n: number }>(
    db,
    sql`select u.account_type, count(*)::int as n
        from app.notifications n join app.users u on u.id = n.user_id
        where n.type = 'legal.updated' and n.data->>'slug' = ${slug}
        group by u.account_type order by u.account_type`,
  );
}

describe('legal.updated notices', () => {
  let n: TestDb;

  beforeAll(async () => {
    n = await createTestDb();
  });

  afterAll(async () => {
    await n.close();
  });

  it('notifies seekers but not hosts of a material Community Guidelines change', async () => {
    await seedSeeker(n.db);
    await seedSeeker(n.db);
    await seedHostOrg(n.db);
    const v1 = await approved(n.db, 'community');
    await scheduleLegal(n.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
    // The first version is published at once and notifies no one.
    expect(await drainNotifyChunks(n.db)).toBe(0);

    const v2 = await approved(n.db, 'community');
    await scheduleLegal(n.db, {
      documentId: v2.id,
      effectiveAt: new Date(NOW.getTime() + 30 * DAY),
      operatorId,
      now: NOW,
    });
    expect(await drainNotifyChunks(n.db)).toBe(1);
    expect(await legalUpdates(n.db, 'community')).toEqual([{ account_type: 'seeker', n: 2 }]);
    const [notice] = await queryRows<{ data: Record<string, unknown> }>(
      n.db,
      sql`select data from app.notifications where type = 'legal.updated' limit 1`,
    );
    expect(notice?.data).toEqual({
      slug: 'community',
      title: 'Community Guidelines',
      effectiveDate: 'December 31, 2026',
      summaryOfChanges: 'What changed.',
    });
  });

  it('sends 1,201 seekers the Terms notice in three jobs of at most 500', async () => {
    const m = await createTestDb();
    try {
      await m.db.execute(sql`
        insert into app.users (id, clerk_user_id, email, display_name, account_type, adult_attested_at)
        select gen_random_uuid(), 'user_bulk_' || g, 'bulk' || g || '@example.test', 'Seeker',
          'seeker', now()
        from generate_series(1, 1201) g
      `);
      const v1 = await approved(m.db, 'terms');
      await scheduleLegal(m.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
      const v2 = await approved(m.db, 'terms');
      await scheduleLegal(m.db, {
        documentId: v2.id,
        effectiveAt: new Date(NOW.getTime() + 31 * DAY),
        operatorId,
        now: NOW,
      });

      expect(await drainNotifyChunks(m.db)).toBe(3);
      expect(await legalUpdates(m.db, 'terms')).toEqual([{ account_type: 'seeker', n: 1201 }]);
      const perUser = await queryRows<{ n: number }>(
        m.db,
        sql`select count(*)::int as n from (
              select user_id from app.notifications where type = 'legal.updated'
              group by user_id having count(*) > 1
            ) dup`,
      );
      expect(perUser).toEqual([{ n: 0 }]);
    } finally {
      await m.close();
    }
  }, 180_000);

  it('notifies no one for a document nobody accepts', async () => {
    const v1 = await approved(n.db, 'subprocessors');
    await scheduleLegal(n.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
    const v2 = await approved(n.db, 'subprocessors');
    await scheduleLegal(n.db, {
      documentId: v2.id,
      effectiveAt: new Date(NOW.getTime() + 30 * DAY),
      operatorId,
      now: NOW,
    });
    expect(await drainNotifyChunks(n.db)).toBe(1);
    expect(await legalUpdates(n.db, 'subprocessors')).toEqual([]);
  });
});

describe('getConsentNotBefore', () => {
  it('is null with no cookie policy, then the effective date of the material version', async () => {
    const c = await createTestDb();
    try {
      expect(await getConsentNotBefore(c.db)).toBeNull();
      resetConsentEpochCache();

      const v1 = await approved(c.db, 'cookies');
      await scheduleLegal(c.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
      expect(await getConsentNotBefore(c.db)).toEqual(NOW);
      resetConsentEpochCache();

      // A change that isn't material leaves earlier choices standing.
      const v2 = await approved(c.db, 'cookies', { material: false });
      const later = new Date(NOW.getTime() + DAY);
      await scheduleLegal(c.db, { documentId: v2.id, effectiveAt: later, operatorId, now: NOW });
      await publishDueLegal(c.db, later);
      expect(await getConsentNotBefore(c.db)).toEqual(NOW);
      resetConsentEpochCache();

      // A material one asks everyone again from its effective date.
      const v3 = await approved(c.db, 'cookies');
      const asked = new Date(later.getTime() + 30 * DAY);
      await scheduleLegal(c.db, { documentId: v3.id, effectiveAt: asked, operatorId, now: later });
      expect(await getConsentNotBefore(c.db)).toEqual(NOW);
      resetConsentEpochCache();
      await publishDueLegal(c.db, asked);
      expect(await getConsentNotBefore(c.db)).toEqual(asked);
    } finally {
      await c.close();
    }
  });

  // Review of PR 231: background analytics asks again after a material Cookie Policy, as the
  // cookie does. Content registers its date with privacy when it loads.
  it("is what privacy's consentForUser checks a stored acceptance against", async () => {
    const c = await createTestDb();
    try {
      const v1 = await approved(c.db, 'cookies');
      await scheduleLegal(c.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
      const { userId: before } = await seedSeeker(c.db);
      const { userId: after } = await seedSeeker(c.db);
      for (const [userId, at] of [
        [before, new Date(NOW.getTime() - DAY)],
        [after, new Date(NOW.getTime() + DAY)],
      ] as const) {
        await c.db.execute(sql`
          insert into app.consent_records
            (id, consent_id, user_id, region, analytics, policy_version, created_at)
          values (gen_random_uuid(), gen_random_uuid()::text, ${userId}, 'eu', true, 1,
            ${at.toISOString()}::timestamptz)
        `);
      }
      const later = new Date(NOW.getTime() + 2 * DAY);
      expect(await consentForUser(c.db, before, later)).toBe(false);
      expect(await consentForUser(c.db, after, later)).toBe(true);
    } finally {
      await c.close();
    }
  });

  it('caches the answer for 300 seconds', async () => {
    const c = await createTestDb();
    try {
      expect(await getConsentNotBefore(c.db, NOW)).toBeNull();
      const v1 = await approved(c.db, 'cookies');
      await scheduleLegal(c.db, { documentId: v1.id, effectiveAt: NOW, operatorId, now: NOW });
      expect(await getConsentNotBefore(c.db, new Date(NOW.getTime() + 299_000))).toBeNull();
      expect(await getConsentNotBefore(c.db, new Date(NOW.getTime() + 300_000))).toEqual(NOW);
    } finally {
      await c.close();
    }
  });
});
