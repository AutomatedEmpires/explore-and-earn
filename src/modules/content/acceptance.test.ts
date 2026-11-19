// Who must accept which legal version (SP8 plan Task 24, spec 8.5): a material version, or the
// first one, asks again; a version that isn't material doesn't. Only the published version can
// be accepted. On PGlite.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator, seedSeeker } from '@tests/helpers/sp8';
import { pendingAcceptances, publishedOnboardingLegal, recordAcceptance } from './acceptance';
import {
  LEGAL_TITLES,
  publishDueLegal,
  recordCounselApproval,
  saveLegalDraft,
  scheduleLegal,
  type LegalSlug,
} from './legal';

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

/** Publishes a new version of `slug` at `at`: at once for the first, else on its date. */
async function publish(
  db: Db,
  slug: LegalSlug,
  o: { material?: boolean; at?: Date } = {},
): Promise<number> {
  const doc = await saveLegalDraft(db, {
    slug,
    title: LEGAL_TITLES[slug],
    bodyMd: `The ${slug} text.`,
    summaryOfChanges: '',
    counselQuestions: '',
    material: o.material ?? true,
    submitForCounsel: true,
    operatorId,
  });
  await recordCounselApproval(db, { documentId: doc.id, note: 'Counsel signed.', operatorId });
  const at = o.at ?? NOW;
  const scheduledAt =
    doc.version === 1 || o.material === false ? at : new Date(at.getTime() - 30 * DAY);
  await scheduleLegal(db, { documentId: doc.id, effectiveAt: at, operatorId, now: scheduledAt });
  await publishDueLegal(db, at);
  return doc.version;
}

async function reasonOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    if (isAppError(err)) return { code: err.code, ...(err.details as object) };
    throw err;
  }
  throw new Error('expected an AppError');
}

describe('pendingAcceptances and recordAcceptance', () => {
  it('asks again after a material version, and not after one that is not material', async () => {
    const { userId } = await seedSeeker(t.db);
    // Nothing published: nothing to accept.
    expect(await pendingAcceptances(t.db, userId)).toEqual([]);

    await publish(t.db, 'terms');
    expect(await pendingAcceptances(t.db, userId)).toEqual([{ slug: 'terms', version: 1 }]);
    await recordAcceptance(t.db, userId, [{ slug: 'terms', version: 1 }]);
    expect(await pendingAcceptances(t.db, userId)).toEqual([]);

    const later = new Date(NOW.getTime() + 40 * DAY);
    await publish(t.db, 'terms', { at: later });
    expect(await pendingAcceptances(t.db, userId)).toEqual([{ slug: 'terms', version: 2 }]);

    // The superseded version can no longer be accepted.
    expect(
      await reasonOf(recordAcceptance(t.db, userId, [{ slug: 'terms', version: 1 }])),
    ).toMatchObject({
      code: 'bad_request',
      reason: 'not_current',
    });
    await recordAcceptance(t.db, userId, [{ slug: 'terms', version: 2 }]);
    // Accepting twice is harmless.
    await recordAcceptance(t.db, userId, [{ slug: 'terms', version: 2 }]);
    expect(await pendingAcceptances(t.db, userId)).toEqual([]);

    await publish(t.db, 'terms', { material: false, at: new Date(later.getTime() + DAY) });
    expect(await pendingAcceptances(t.db, userId)).toEqual([]);

    const rows = await queryRows<{ slug: string; version: number }>(
      t.db,
      sql`select slug, version from app.legal_acceptances where user_id = ${userId} order by version`,
    );
    expect(rows).toEqual([
      { slug: 'terms', version: 1 },
      { slug: 'terms', version: 2 },
    ]);
  });

  it('returns the published version to accept, even when a later one is not material', async () => {
    const c = await createTestDb();
    try {
      const { userId } = await seedSeeker(c.db);
      await publish(c.db, 'community');
      await publish(c.db, 'community', { material: false, at: new Date(NOW.getTime() + DAY) });
      // The required version is 1; the version accepted now is the published one, 2.
      expect(await pendingAcceptances(c.db, userId)).toEqual([{ slug: 'community', version: 2 }]);
      await recordAcceptance(c.db, userId, [{ slug: 'community', version: 2 }]);
      expect(await pendingAcceptances(c.db, userId)).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it('asks seekers and hosts for their own documents, and operators for none', async () => {
    const c = await createTestDb();
    try {
      for (const slug of ['terms', 'host-terms', 'privacy', 'community', 'cookies'] as const) {
        await publish(c.db, slug);
      }
      const { userId: seeker } = await seedSeeker(c.db);
      const { owner } = await seedHostOrg(c.db);
      const { userId: operator } = await seedOperator(c.db);

      expect(await pendingAcceptances(c.db, seeker)).toEqual([
        { slug: 'terms', version: 1 },
        { slug: 'privacy', version: 1 },
        { slug: 'community', version: 1 },
      ]);
      expect(await pendingAcceptances(c.db, owner.userId)).toEqual([
        { slug: 'terms', version: 1 },
        { slug: 'host-terms', version: 1 },
        { slug: 'privacy', version: 1 },
      ]);
      expect(await pendingAcceptances(c.db, operator)).toEqual([]);

      expect(await publishedOnboardingLegal(c.db, 'seeker')).toEqual([
        { slug: 'terms', version: 1 },
        { slug: 'privacy', version: 1 },
        { slug: 'community', version: 1 },
      ]);
      expect(await publishedOnboardingLegal(c.db, 'host')).toEqual([
        { slug: 'terms', version: 1 },
        { slug: 'host-terms', version: 1 },
        { slug: 'privacy', version: 1 },
      ]);
    } finally {
      await c.close();
    }
  });

  it('refuses a document that has no published version', async () => {
    const { userId } = await seedSeeker(t.db);
    expect(
      await reasonOf(recordAcceptance(t.db, userId, [{ slug: 'fit-score', version: 1 }])),
    ).toMatchObject({ code: 'bad_request', reason: 'not_current' });
    const rows = await queryRows(
      t.db,
      sql`select id from app.legal_acceptances where user_id = ${userId}`,
    );
    expect(rows).toEqual([]);
  });
});
