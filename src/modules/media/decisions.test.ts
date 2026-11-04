// Operator decisions on media review items, through the real trust module: every state a file
// reaches with an open item (blocked, held, rejected) can be decided, and an appeal or an
// accuracy sample can reverse a removal or an automatic rejection.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassifyOptions } from '@/lib/ai';
import { queryRows } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { auditSample, decide, openAppeal, openReviewItem } from '@/modules/trust';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
// The module index registers the `media` trust subject.
import { jobHandlers } from './index';
import type { MediaKind } from './kinds';
import { scanMedia } from './scan';
import { stubChildSafetyScanner, stubMalwareScanner } from './scanners';
import { getStorage, type MemoryStorage } from './storage';
import { completeUpload, requestUpload } from './uploads';

// classify() runs the stub provider (AI_PROVIDER=stub) unless a test overrides it.
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
  // Modules loaded through identity (orgs) register their notification types at load.
  defineType: vi.fn(),
  jobHandlers: {},
}));

const FIXTURES = path.resolve('tests/fixtures/media');
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

let t: TestDb;
let storage: MemoryStorage;

beforeAll(async () => {
  vi.stubEnv('STORAGE_PROVIDER', 'stub');
  vi.stubEnv('CHILD_SAFETY_PROVIDER', 'stub');
  vi.stubEnv('MALWARE_PROVIDER', 'stub');
  resetEnvCache();
  storage = getStorage() as MemoryStorage;
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
  vi.unstubAllEnvs();
  resetEnvCache();
});

beforeEach(async () => {
  ai.override = null;
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`delete from app.review_actions`);
  await t.db.execute(sql`delete from app.review_notes`);
  await t.db.execute(sql`update app.review_items set original_item_id = null`);
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.trust_checks`);
  await t.db.execute(sql`delete from app.operators`);
});

const deps = (blockedHashes: string[] = []) => ({
  storage,
  childSafety: stubChildSafetyScanner(blockedHashes),
  malware: stubMalwareScanner(),
});

async function addOwner(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${id}@ops.test`}, 'Owner', 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${id}, 'owner', '{}'::text[], 'on_shift')
  `);
  return id;
}

async function uploaded(kind: MediaKind, mime: string, bytes: Uint8Array): Promise<string> {
  const userId = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`);
  const { mediaId } = await requestUpload(
    t.db,
    storage,
    { userId },
    { kind, mime, sizeBytes: bytes.byteLength },
  );
  await storage.write('quarantine', mediaId, bytes, mime);
  await completeUpload(t.db, { userId }, mediaId);
  await t.db.execute(sql`delete from app.outbox`);
  return mediaId;
}

const mediaRow = async (id: string) => {
  const [r] = await queryRows<{
    status: string;
    bucket: string;
    rejection_reason: string | null;
    alt_text: string | null;
  }>(
    t.db,
    sql`select status, bucket, rejection_reason, alt_text from app.media where id = ${id}`,
  );
  return r;
};

const itemFor = async (queue: string, mediaId: string) => {
  const [r] = await queryRows<{ id: string; status: string; resolution: string | null }>(
    t.db,
    sql`select id, status, resolution from app.review_items
        where queue = ${queue} and subject_type = 'media' and subject_id = ${mediaId}`,
  );
  if (!r) throw new Error(`no ${queue} item for ${mediaId}`);
  return r;
};

async function codeOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof AppError)) throw new Error(`expected an AppError, got ${String(err)}`);
  return err.code;
}

const objectsOf = (bucket: Parameters<MemoryStorage['list']>[0], mediaId: string) =>
  storage.list(bucket).filter((p) => p.startsWith(mediaId));

describe('deciding media review items', () => {
  it('resolves a child-safety item by confirming the block; the evidence stays', async () => {
    const owner = await addOwner();
    const original = fixture('gps.jpg');
    const mediaId = await uploaded('community_photo', 'image/jpeg', original);
    expect(await scanMedia(t.db, deps([sha256(original)]), mediaId)).toBe('blocked');
    const item = await itemFor('child_safety', mediaId);

    // A match is never published.
    expect(await codeOf(decide(t.db, item.id, owner, 'approve'))).toBe('conflict');

    expect(await decide(t.db, item.id, owner, 'remove')).toEqual({ status: 'applied' });
    await runWorker(t.db, { handlers: jobHandlers });

    expect(await itemFor('child_safety', mediaId)).toMatchObject({
      status: 'resolved',
      resolution: 'remove',
    });
    expect(await mediaRow(mediaId)).toMatchObject({ status: 'blocked', bucket: 'evidence' });
    expect([...(await storage.read('evidence', mediaId))]).toEqual([...original]);
  });

  it('grants an appeal of a removed image by publishing it again', async () => {
    const owner = await addOwner();
    const mediaId = await uploaded('listing_photo', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    const report = await openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'media',
      subjectId: mediaId,
      reason: 'reported',
    });
    await decide(t.db, report.id, owner, 'remove');
    expect(await mediaRow(mediaId)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'removed_by_operator',
    });

    // The only operator decided the removal, and nobody else could take the appeal.
    const appeal = await openAppeal(t.db, { originalItemId: report.id, reason: 'It is mine' });
    expect(await decide(t.db, appeal.id, owner, 'approve')).toEqual({ status: 'applied' });

    expect(await mediaRow(mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
      rejection_reason: null,
    });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);
    expect(objectsOf('media-private', mediaId)).toEqual([]);
  });

  it('publishes an automatically rejected image an accuracy sample overturns', async () => {
    const owner = await addOwner();
    ai.override = async () => ({
      score: 0.95,
      labels: ['violence'],
      reason: 'Looks violent',
      altText: 'A kitchen table',
    });
    const mediaId = await uploaded('meal_photo', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await mediaRow(mediaId)).toMatchObject({ rejection_reason: 'unsafe_content' });

    expect(await auditSample(t.db, new Date(Date.now() + 60_000), 1)).toBe(1);
    const sample = await itemFor('audit_sample', mediaId);
    expect(await decide(t.db, sample.id, owner, 'approve')).toEqual({ status: 'applied' });

    expect(await mediaRow(mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
      rejection_reason: null,
      alt_text: 'A kitchen table',
    });
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);
  });
});
