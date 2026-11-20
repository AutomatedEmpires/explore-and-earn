// The legal routes (SP8 plan Task 24): GET /legal/{slug}, GET /me/legal/pending and POST
// /me/legal/acceptances. On PGlite, with the session guard mocked.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import {
  LEGAL_TITLES,
  publishDueLegal,
  recordCounselApproval,
  saveLegalDraft,
  scheduleLegal,
  type LegalSlug,
} from '@/modules/content';
import type { CurrentUser } from '@/modules/identity';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOperator, seedSeeker } from '@tests/helpers/sp8';

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!dbHolder.current) throw new Error('test db not ready');
      return dbHolder.current;
    },
  };
});

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock('@/server/guards', async () => {
  const { unauthorized } = await import('@/lib/errors');
  return {
    requireUser: vi.fn(async () => {
      if (!session.user) throw unauthorized('Sign in required');
      return session.user;
    }),
  };
});

const NOW = new Date('2026-12-01T12:00:00Z');

let t: TestDb;
let operatorId: string;
let getDoc: typeof import('./[slug]/route').GET;
let getPending: typeof import('../me/legal/pending/route').GET;
let postAcceptances: typeof import('../me/legal/acceptances/route').POST;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  ({ userId: operatorId } = await seedOperator(t.db, { role: 'owner' }));
  ({ GET: getDoc } = await import('./[slug]/route'));
  ({ GET: getPending } = await import('../me/legal/pending/route'));
  ({ POST: postAcceptances } = await import('../me/legal/acceptances/route'));
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(() => {
  session.user = null;
});

async function publish(slug: LegalSlug, body = `The ${slug} text.`): Promise<number> {
  const doc = await saveLegalDraft(t.db, {
    slug,
    title: LEGAL_TITLES[slug],
    bodyMd: body,
    summaryOfChanges: '',
    counselQuestions: '',
    material: true,
    submitForCounsel: true,
    operatorId,
  });
  await recordCounselApproval(t.db, { documentId: doc.id, note: 'Counsel signed.', operatorId });
  await scheduleLegal(t.db, { documentId: doc.id, effectiveAt: NOW, operatorId, now: NOW });
  await publishDueLegal(t.db, NOW);
  return doc.version;
}

function readDoc(slug: string): Promise<Response> {
  return getDoc(new Request(`http://localhost:3000/api/v1/legal/${slug}`), {
    params: Promise.resolve({ slug }),
  });
}

function accept(items: unknown): Promise<Response> {
  return postAcceptances(
    new Request('http://localhost:3000/api/v1/me/legal/acceptances', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ items }),
    }),
  );
}

describe('GET /api/v1/legal/{slug}', () => {
  it('answers 404 for a draft, a version with counsel, and an unknown document', async () => {
    await saveLegalDraft(t.db, {
      slug: 'international',
      title: LEGAL_TITLES.international,
      bodyMd: 'Draft for counsel review, not legal advice.',
      summaryOfChanges: '',
      counselQuestions: '',
      material: true,
      submitForCounsel: true,
      operatorId,
    });
    expect((await readDoc('international')).status).toBe(404);
    expect((await readDoc('terms-of-anything')).status).toBe(404);
  });

  it('returns the published version', async () => {
    await publish('cookies', 'The cookie policy.');
    const res = await readDoc('cookies');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      slug: 'cookies',
      version: 1,
      title: 'Cookie Policy',
      bodyMd: 'The cookie policy.',
      effectiveAt: NOW.toISOString(),
    });
  });
});

describe('GET /api/v1/me/legal/pending and POST /api/v1/me/legal/acceptances', () => {
  it('lists what a seeker must accept, and clears it once accepted', async () => {
    await publish('terms');
    await publish('community');
    const { user, userId } = await seedSeeker(t.db);
    session.user = user;

    const pending = await getPending(new Request('http://localhost:3000/api/v1/me/legal/pending'));
    expect(pending.status).toBe(200);
    expect(await pending.json()).toEqual({
      items: [
        { slug: 'terms', version: 1, title: 'Terms of Service', url: '/legal/terms' },
        { slug: 'community', version: 1, title: 'Community Guidelines', url: '/legal/community' },
      ],
    });

    expect((await accept([{ slug: 'terms', version: 2 }])).status).toBe(400);
    const ok = await accept([
      { slug: 'terms', version: 1 },
      { slug: 'community', version: 1 },
    ]);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    const after = await getPending(new Request('http://localhost:3000/api/v1/me/legal/pending'));
    expect(await after.json()).toEqual({ items: [] });
    const rows = await queryRows<{ slug: string }>(
      t.db,
      sql`select slug from app.legal_acceptances where user_id = ${userId} order by slug`,
    );
    expect(rows).toEqual([{ slug: 'community' }, { slug: 'terms' }]);
  });

  it('answers not_current for a version that is not published', async () => {
    const { user } = await seedSeeker(t.db);
    session.user = user;
    const res = await accept([{ slug: 'fit-score', version: 1 }]);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'bad_request', details: { reason: 'not_current' } },
    });
  });

  it('takes 1 to 8 items', async () => {
    const { user } = await seedSeeker(t.db);
    session.user = user;
    expect((await accept([])).status).toBe(400);
    expect(
      (await accept(Array.from({ length: 9 }, () => ({ slug: 'terms', version: 1 })))).status,
    ).toBe(400);
    expect((await accept([{ slug: 'not-a-document', version: 1 }])).status).toBe(400);
  });

  it('needs a signed-in person', async () => {
    expect(
      (await getPending(new Request('http://localhost:3000/api/v1/me/legal/pending'))).status,
    ).toBe(401);
    expect((await accept([{ slug: 'terms', version: 1 }])).status).toBe(401);
  });
});
