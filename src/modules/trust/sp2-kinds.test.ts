// SP2 touchpoints in trust: the listing, fraud, verification and photo-slot check kinds, the
// optional review queue, the open-item lookup and the review item id passed to handlers.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { ClassifierError, type ClassifyOptions } from '@/lib/ai';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  decide,
  listOpenReviewItems,
  openReviewItem,
  raiseAlert,
  registerSubjectHandlers,
  runCheck,
} from './index';
import { addOperator, resetTrustTables } from './test-fixtures';

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
  await resetTrustTables(t.db);
});

afterEach(() => {
  vi.clearAllMocks();
});

const items = () =>
  queryRows<{ queue: string; subject_type: string; subject_id: string; reason: string }>(
    t.db,
    sql`select * from app.review_items order by created_at, id`,
  );

const checkRow = (id: string) =>
  queryRows<{ kind: string; prompt_version: string }>(
    t.db,
    sql`select kind, prompt_version from app.trust_checks where id = ${id}::uuid`,
  );

describe('runCheck: SP2 kinds', () => {
  it('sends an uncertain listing to the moderation queue by default', async () => {
    const subjectId = newId();
    const result = await runCheck(t.db, {
      kind: 'listing_moderation',
      subjectType: 'listing_revision',
      subjectId,
      text: 'Lift operator. __flag__',
    });
    expect(result.decision).toBe('needs_review');
    expect(await items()).toEqual([
      expect.objectContaining({ queue: 'moderation', subject_id: subjectId }),
    ]);
    expect(await checkRow(result.checkId)).toEqual([
      { kind: 'listing_moderation', prompt_version: 'listing_moderation@1' },
    ]);
  });

  it('puts the item in the queue given, or opens none with reviewQueue null', async () => {
    const base = {
      kind: 'listing_moderation' as const,
      subjectType: 'listing_revision',
      text: '__flag__',
    };
    const fraud = await runCheck(t.db, { ...base, subjectId: newId(), reviewQueue: 'fraud' });
    expect(fraud.decision).toBe('needs_review');
    expect((await items()).map((i) => i.queue)).toEqual(['fraud']);

    const none = await runCheck(t.db, { ...base, subjectId: newId(), reviewQueue: null });
    expect(none.decision).toBe('needs_review');
    expect(await items()).toHaveLength(1);
  });

  it('rejects listing fraud at 0.95 and never rejects business verification', async () => {
    const fraud = await runCheck(t.db, {
      kind: 'listing_fraud',
      subjectType: 'listing_revision',
      subjectId: newId(),
      text: '__block__',
    });
    expect(fraud.decision).toBe('rejected');

    const verification = await runCheck(t.db, {
      kind: 'business_verification',
      subjectType: 'organization',
      subjectId: newId(),
      text: '__block__',
      reviewQueue: 'fraud',
    });
    expect(verification.decision).toBe('needs_review');
    expect((await items()).map((i) => i.queue)).toEqual(['fraud']);
  });

  it('sends a business verification whose classifier throws to the queue given', async () => {
    ai.override = async () => {
      throw new ClassifierError('timeout', 'Classifier timed out');
    };
    const subjectId = newId();
    const result = await runCheck(t.db, {
      kind: 'business_verification',
      subjectType: 'organization',
      subjectId,
      text: 'Kettle Ridge Lodge',
      reviewQueue: 'fraud',
    });
    expect(result).toMatchObject({ decision: 'needs_review', reason: 'classifier_error' });
    expect(await items()).toEqual([
      expect.objectContaining({
        queue: 'fraud',
        subject_type: 'organization',
        subject_id: subjectId,
        reason: 'classifier_error',
      }),
    ]);
  });

  it('checks a photo slot from the image and its slot label, with no review band', async () => {
    const image = { mime: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2]) };
    const match = await runCheck(t.db, {
      kind: 'photo_slot',
      subjectType: 'media',
      subjectId: newId(),
      image,
      text: 'bathroom',
      reviewQueue: null,
    });
    expect(match.decision).toBe('approved');

    const flagged = {
      ...image,
      bytes: new Uint8Array([...image.bytes, ...Buffer.from('__flag__')]),
    };
    const mismatch = await runCheck(t.db, {
      kind: 'photo_slot',
      subjectType: 'media',
      subjectId: newId(),
      image: flagged,
      text: 'bathroom',
      reviewQueue: null,
    });
    // Thresholds 0.5 / 0.5: a 0.5 score is a mismatch, never a review.
    expect(mismatch.decision).toBe('rejected');
    expect(await items()).toHaveLength(0);
  });

  it('needs text for the text kinds and an image for photo_slot', async () => {
    await expect(
      runCheck(t.db, {
        kind: 'listing_fraud',
        subjectType: 'listing_revision',
        subjectId: newId(),
      }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(
      runCheck(t.db, { kind: 'photo_slot', subjectType: 'media', subjectId: newId(), text: 'x' }),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('listOpenReviewItems', () => {
  it('returns open, assigned and escalated items for the subject, not resolved ones', async () => {
    const op = await addOperator(t.db, { role: 'owner' });
    const subjectId = newId();
    const open = (queue: 'moderation' | 'fraud') =>
      openReviewItem(t.db, { queue, subjectType: 'test_item', subjectId, reason: `r-${queue}` });

    const a = await open('moderation');
    const b = await open('fraud');
    const c = await open('moderation');
    await t.db.execute(sql`update app.review_items set status = 'open',
      assignee_operator_id = null where id = ${a.id}::uuid`);
    await t.db.execute(sql`update app.review_items set status = 'escalated',
      escalated_to = ${op}::uuid where id = ${b.id}::uuid`);
    await decide(t.db, c.id, op, 'approve');
    await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'test_item',
      subjectId: newId(),
      reason: 'other subject',
    });

    const found = await listOpenReviewItems(t.db, 'test_item', subjectId);
    expect(found.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect(found.find((i) => i.id === b.id)).toEqual({
      id: b.id,
      queue: 'fraud',
      reason: 'r-fraud',
    });
  });
});

describe('decide', () => {
  it('passes the review item id to the subject handler', async () => {
    const seen: unknown[] = [];
    registerSubjectHandlers('sp2_test_subject', {
      approve: async (_db, _subjectId, data) => {
        seen.push(data);
      },
    });
    const op = await addOperator(t.db, { role: 'owner' });
    const item = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'sp2_test_subject',
      subjectId: newId(),
      reason: 'test',
    });

    await decide(t.db, item.id, op, 'approve', { note: 'Looks fine' });

    expect(seen).toEqual([{ note: 'Looks fine', reviewItemId: item.id }]);
  });
});

describe('raiseAlert', () => {
  it('is exported for SP2 callers', () => {
    expect(typeof raiseAlert).toBe('function');
  });
});
