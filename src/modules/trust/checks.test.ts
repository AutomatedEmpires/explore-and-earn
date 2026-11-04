import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import type { ClassifyOptions } from '@/lib/ai';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import { findLatestCheck, runCheck } from './index';

// classify() runs the real stub provider (AI_PROVIDER=stub in tests) unless a test overrides it.
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

vi.mock('@/modules/notifications', () => ({
  notify: vi.fn(async () => {}),
  jobHandlers: {},
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  ai.override = null;
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.trust_checks`);
  await t.db.execute(sql`delete from app.settings`);
});

afterEach(() => {
  vi.clearAllMocks();
});

type CheckRow = {
  id: string;
  kind: string;
  subject_type: string;
  subject_id: string;
  provider: string;
  model: string;
  prompt_version: string;
  score: number | null;
  decision: string;
  reason: string;
  latency_ms: number;
  error: string | null;
};

const checks = () =>
  queryRows<CheckRow>(t.db, sql`select * from app.trust_checks order by created_at, id`);

const items = () =>
  queryRows<{
    queue: string;
    status: string;
    subject_type: string;
    subject_id: string;
    check_id: string | null;
    reason: string;
    ai_confidence: number | null;
  }>(t.db, sql`select * from app.review_items order by created_at, id`);

const textCheck = (text: string) =>
  runCheck(t.db, { kind: 'text_safety', subjectType: 'test_item', subjectId: newId(), text });

describe('runCheck with the stub classifier', () => {
  it('approves ordinary text and opens no review item', async () => {
    const result = await textCheck('hello');
    expect(result).toMatchObject({ decision: 'approved', score: 0.02, labels: [], reason: 'stub' });
    expect(await items()).toHaveLength(0);
  });

  it('sends uncertain text to the moderation queue', async () => {
    const subjectId = newId();
    const result = await runCheck(t.db, {
      kind: 'text_safety',
      subjectType: 'test_item',
      subjectId,
      text: 'please __flag__ this',
    });

    expect(result.decision).toBe('needs_review');
    expect(result.score).toBe(0.5);
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      queue: 'moderation',
      status: 'open',
      subject_type: 'test_item',
      subject_id: subjectId,
      check_id: result.checkId,
      ai_confidence: 0.5,
    });
  });

  it('rejects clearly unsafe text without a review item', async () => {
    const result = await textCheck('__block__');
    expect(result).toMatchObject({ decision: 'rejected', score: 0.95 });
    expect(await items()).toHaveLength(0);
  });

  it('checks images, and returns alt text only when asked for it', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const base = {
      kind: 'image_safety' as const,
      subjectType: 'media',
      image: { mime: 'image/jpeg', bytes },
    };

    const withAlt = await runCheck(t.db, { ...base, subjectId: newId(), wantAltText: true });
    expect(withAlt).toMatchObject({ decision: 'approved', altText: 'Test image' });

    const withoutAlt = await runCheck(t.db, { ...base, subjectId: newId() });
    expect(withoutAlt.decision).toBe('approved');
    expect(withoutAlt).not.toHaveProperty('altText');

    expect((await checks()).map((c) => c.prompt_version)).toEqual([
      'image_safety@1',
      'image_safety@1',
    ]);
  });
});

describe('runCheck when the classifier fails (fail closed)', () => {
  it('sends the subject to review when classify throws', async () => {
    ai.override = async () => {
      throw new Error('connection reset');
    };
    const result = await textCheck('hello');

    expect(result).toMatchObject({ decision: 'needs_review', reason: 'classifier_error' });
    const [row] = await items();
    expect(row).toMatchObject({ queue: 'moderation', reason: 'classifier_error' });
    expect(row?.ai_confidence).toBeNull();
    const [check] = await checks();
    expect(check).toMatchObject({ decision: 'needs_review', reason: 'classifier_error' });
    expect(check?.score).toBeNull();
    expect(check?.error).toContain('connection reset');
  });

  it('sends the subject to review when classify returns the wrong shape', async () => {
    ai.override = async () => ({ score: 'high', labels: [], reason: 'x' });
    const result = await textCheck('hello');

    expect(result).toMatchObject({ decision: 'needs_review', reason: 'classifier_error' });
    expect(await items()).toHaveLength(1);
  });

  it('never approves when the score is out of range', async () => {
    ai.override = async () => ({ score: -1, labels: [], reason: 'x' });
    expect((await textCheck('hello')).decision).toBe('needs_review');
  });
});

describe('findLatestCheck', () => {
  const flagged = {
    mime: 'image/jpeg',
    bytes: new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode('__flag__')]),
  };

  it('returns the newest check of a kind for a subject, as runCheck returned it', async () => {
    const subjectId = newId();
    const subject = { kind: 'image_safety' as const, subjectType: 'media', subjectId };
    expect(await findLatestCheck(t.db, subject)).toBeNull();

    await runCheck(t.db, { ...subject, image: flagged, wantAltText: true });
    const newest = await runCheck(t.db, { ...subject, image: flagged, wantAltText: true });
    // Neither another kind for the subject nor the same kind for another subject counts.
    await runCheck(t.db, { kind: 'text_safety', subjectType: 'media', subjectId, text: 'hi' });
    await runCheck(t.db, { ...subject, subjectId: newId(), image: flagged });

    expect(newest).toMatchObject({ decision: 'needs_review', score: 0.5, altText: 'Test image' });
    expect(await findLatestCheck(t.db, subject)).toEqual(newest);
  });

  it('reads a failed check as needs_review with score 1, like runCheck', async () => {
    ai.override = async () => {
      throw new Error('timeout');
    };
    const subject = { kind: 'text_safety' as const, subjectType: 'test_item', subjectId: newId() };
    const result = await runCheck(t.db, { ...subject, text: 'hello' });
    expect(await findLatestCheck(t.db, subject)).toEqual(result);
    expect(result).toMatchObject({ decision: 'needs_review', score: 1, reason: 'classifier_error' });
  });
});

describe('runCheck thresholds', () => {
  it('reads them from trust.thresholds', async () => {
    await setSetting(
      t.db,
      'trust.thresholds',
      {
        image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        text_safety: { approveBelow: 0.6, rejectAtOrAbove: 0.9 },
      },
      { operatorId: newId() },
    );

    expect((await textCheck('__flag__')).decision).toBe('approved');
    expect(await items()).toHaveLength(0);
  });

  it('treats a score equal to rejectAtOrAbove as rejected', async () => {
    ai.override = async () => ({ score: 0.9, labels: ['scam'], reason: 'Asks for a deposit.' });
    expect(await textCheck('pay first')).toMatchObject({
      decision: 'rejected',
      labels: ['scam'],
      reason: 'Asks for a deposit.',
    });
  });
});

describe('runCheck records', () => {
  it('stores one trust_checks row per call with the prompt version and model', async () => {
    const results = [
      await textCheck('hello'),
      await textCheck('__flag__'),
      await textCheck('__block__'),
    ];
    const rows = await checks();

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(results.map((r) => r.checkId));
    expect(rows.map((r) => r.decision)).toEqual(['approved', 'needs_review', 'rejected']);
    for (const row of rows) {
      expect(row).toMatchObject({
        kind: 'text_safety',
        subject_type: 'test_item',
        provider: 'stub',
        model: 'claude-haiku-5-5',
        prompt_version: 'text_safety@1',
      });
      expect(row.latency_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the alt text it returned, and only that', async () => {
    const image = { mime: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]) };
    const base = { kind: 'image_safety' as const, subjectType: 'media', image };
    await runCheck(t.db, { ...base, subjectId: newId(), wantAltText: true });
    await runCheck(t.db, { ...base, subjectId: newId() });
    const rows = await queryRows<{ alt_text: string | null }>(
      t.db,
      sql`select alt_text from app.trust_checks order by created_at, id`,
    );
    expect(rows.map((r) => r.alt_text)).toEqual(['Test image', null]);
  });

  it('refuses a check without the input its kind needs', async () => {
    await expect(
      runCheck(t.db, { kind: 'image_safety', subjectType: 'media', subjectId: newId() }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(
      runCheck(t.db, { kind: 'text_safety', subjectType: 'x', subjectId: newId(), text: '' }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(await checks()).toHaveLength(0);
  });
});
