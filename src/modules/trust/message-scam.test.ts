import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { ClassifierError, type ClassifyOptions } from '@/lib/ai';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runCheck } from './index';
import { LABELS, system, version } from './prompts/message_scam';
import { resetTrustTables } from './test-fixtures';

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
  defineType: vi.fn(),
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
  await resetTrustTables(t.db);
});

const itemsFor = (subjectId: string) =>
  queryRows<{ queue: string }>(
    t.db,
    sql`select queue from app.review_items where subject_id = ${subjectId}`,
  );

describe('message_scam', () => {
  it('names version message_scam@1 and all six labels', () => {
    expect(version).toBe('message_scam@1');
    for (const label of LABELS) expect(system).toContain(label);
  });

  it('sends a flagged note to moderation, rejects a block, and approves ordinary text', async () => {
    const flagged = newId();
    const blocked = newId();
    const clear = newId();
    const flag = await runCheck(t.db, {
      kind: 'message_scam',
      subjectType: 'message',
      subjectId: flagged,
      text: 'Pay a deposit __flag__',
    });
    expect(flag.decision).toBe('needs_review');
    expect(await itemsFor(flagged)).toEqual([{ queue: 'moderation' }]);

    const block = await runCheck(t.db, {
      kind: 'message_scam',
      subjectType: 'message',
      subjectId: blocked,
      text: '__block__',
    });
    expect(block.decision).toBe('rejected');

    const ok = await runCheck(t.db, {
      kind: 'message_scam',
      subjectType: 'message',
      subjectId: clear,
      text: 'See you Monday',
    });
    expect(ok.decision).toBe('approved');
  });

  it('sends a classifier failure to review with reason classifier_error', async () => {
    ai.override = async () => {
      throw new ClassifierError('api_error', 'down');
    };
    const result = await runCheck(t.db, {
      kind: 'message_scam',
      subjectType: 'message',
      subjectId: newId(),
      text: 'Hello',
    });
    expect(result).toMatchObject({ decision: 'needs_review', reason: 'classifier_error' });
  });

  it('keeps only the scam labels', async () => {
    ai.override = async () => ({
      score: 0.5,
      labels: ['gift_card', 'spam'],
      reason: 'Asks for a card.',
    });
    const result = await runCheck(t.db, {
      kind: 'message_scam',
      subjectType: 'message',
      subjectId: newId(),
      text: 'Buy a card',
    });
    expect(result.labels).toEqual(['gift_card']);
  });
});
