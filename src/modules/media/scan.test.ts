import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type DbOrTx } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import type { CheckResult, OpenReviewItemInput, RunCheckInput } from '@/modules/trust';
import { pdfWithEicar } from '../../../tests/fixtures/media/eicar';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
// The module index registers the `media` trust subject (with the mocked trust below).
import { jobHandlers } from './index';
import type { MediaKind } from './kinds';
import { scanMedia } from './scan';
import {
  cloudmersiveScanner,
  photoDnaScanner,
  stubChildSafetyScanner,
  stubMalwareScanner,
  UndecodableImageError,
  UnscannableImageError,
} from './scanners';
import { getStorage, type MemoryStorage } from './storage';
import { completeUpload, requestUpload } from './uploads';

// The trust module (W5) is replaced by a fake that keeps the documented contract:
// runCheck returns the verdict set for the subject (default approved) and, like the real one,
// opens a moderation item on needs_review and stores the result, which findLatestCheck
// returns; openReviewItem records the item; decide() runs the subject handler registered for
// the item's subject type, the way trust.decide applies it.
type SubjectHandler = (db: DbOrTx, subjectId: string, data?: unknown) => Promise<void>;
type FakeItem = OpenReviewItemInput & { id: string; resolution?: string };
type CheckKey = Pick<RunCheckInput, 'kind' | 'subjectType' | 'subjectId'>;

const trust = vi.hoisted(() => {
  const subjects = new Map<string, Partial<Record<string, SubjectHandler>>>();
  const items: FakeItem[] = [];
  const checks: RunCheckInput[] = [];
  const results = new Map<string, CheckResult>();
  const verdicts = new Map<string, CheckResult['decision']>();
  const keyOf = (k: CheckKey) => `${k.kind}:${k.subjectType}:${k.subjectId}`;

  const openReviewItem = async (_db: DbOrTx, i: OpenReviewItemInput) => {
    const id = globalThis.crypto.randomUUID();
    items.push({ ...i, id });
    return { id };
  };

  return {
    subjects,
    items,
    checks,
    results,
    verdicts,
    openReviewItem,
    async findLatestCheck(_db: DbOrTx, k: CheckKey): Promise<CheckResult | null> {
      return results.get(keyOf(k)) ?? null;
    },
    registerSubjectHandlers(subjectType: string, h: Partial<Record<string, SubjectHandler>>) {
      subjects.set(subjectType, h);
    },
    async runCheck(db: DbOrTx, i: RunCheckInput): Promise<CheckResult> {
      checks.push(i);
      const checkId = globalThis.crypto.randomUUID();
      const decision = verdicts.get(i.subjectId) ?? 'approved';
      const score = { approved: 0.02, needs_review: 0.5, rejected: 0.95 }[decision];
      if (decision === 'needs_review') {
        await openReviewItem(db, {
          queue: 'moderation',
          subjectType: i.subjectType,
          subjectId: i.subjectId,
          reason: 'needs_review',
          checkId,
          aiConfidence: score,
        });
      }
      const result: CheckResult = { checkId, decision, score, labels: [], reason: 'fake' };
      if (i.wantAltText) result.altText = 'Test image';
      results.set(keyOf(i), result);
      return result;
    },
    async decide(db: DbOrTx, itemId: string, action: 'approve' | 'remove') {
      const item = items.find((x) => x.id === itemId);
      if (!item) throw new Error(`no item ${itemId}`);
      const handler = subjects.get(item.subjectType)?.[action];
      if (!handler) throw new Error(`no ${action} handler for ${item.subjectType}`);
      await db.transaction(async (tx) => handler(tx, item.subjectId));
      item.resolution = action;
    },
  };
});

vi.mock('@/modules/trust', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/trust')>()),
  findLatestCheck: trust.findLatestCheck,
  openReviewItem: trust.openReviewItem,
  registerSubjectHandlers: trust.registerSubjectHandlers,
  runCheck: trust.runCheck,
}));

const FIXTURES = path.resolve('tests/fixtures/media');
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** A JPEG header (the type check passes) with no decodable image behind it. */
const corruptJpeg = () =>
  new Uint8Array([...fixture('gps.jpg').subarray(0, 20), ...new Uint8Array(200).fill(7)]);

/** A WebP whose header reads (sharp knows its format and size) but whose pixels don't decode. */
async function undecodableWebp(): Promise<Uint8Array> {
  const webp = new Uint8Array(await sharp(fixture('gps.jpg')).webp().toBuffer());
  webp.fill(0x55, 40);
  return webp;
}

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
  trust.items.length = 0;
  trust.checks.length = 0;
  trust.results.clear();
  trust.verdicts.clear();
  await t.db.execute(sql`delete from app.outbox`);
});

const deps = (blockedHashes: string[] = []) => ({
  storage,
  childSafety: stubChildSafetyScanner(blockedHashes),
  malware: stubMalwareScanner(),
});

async function uploaded(kind: MediaKind, mime: string, bytes: Uint8Array) {
  const userId = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`);
  const { mediaId } = await requestUpload(
    t.db,
    storage,
    { userId },
    {
      kind,
      mime,
      sizeBytes: bytes.byteLength,
    },
  );
  await storage.write('quarantine', mediaId, bytes, mime);
  await completeUpload(t.db, { userId }, mediaId);
  return { userId, mediaId };
}

type Row = {
  status: string;
  bucket: string;
  path: string;
  detected_mime: string | null;
  rejection_reason: string | null;
  size_bytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  variants: Record<string, string> | null;
};

async function row(mediaId: string): Promise<Row> {
  const [r] = await queryRows<Row>(
    t.db,
    sql`select status, bucket, path, detected_mime, rejection_reason, size_bytes, sha256, width,
          height, alt_text, variants from app.media where id = ${mediaId}`,
  );
  if (!r) throw new Error(`no media ${mediaId}`);
  return r;
}

const objectsOf = (bucket: Parameters<MemoryStorage['list']>[0], mediaId: string) =>
  storage.list(bucket).filter((p) => p.startsWith(mediaId));

describe('scanMedia: the real type comes from the bytes (Review Focus 3)', () => {
  it('rejects a PDF declared as image/jpeg with type_mismatch', async () => {
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', fixture('disguised.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');

    const r = await row(mediaId);
    expect(r).toMatchObject({
      status: 'rejected',
      rejection_reason: 'type_mismatch',
      detected_mime: 'application/pdf',
    });
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(trust.checks).toEqual([]);
  });

  it('rejects an SVG declared as image/png with type_mismatch', async () => {
    const { mediaId } = await uploaded('avatar', 'image/png', fixture('image.svg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'type_mismatch' });
    expect(objectsOf('media-public', mediaId)).toEqual([]);
  });

  it('rejects a real PNG declared as image/jpeg', async () => {
    const { mediaId } = await uploaded('avatar', 'image/jpeg', fixture('gps.png'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({
      rejection_reason: 'type_mismatch',
      detected_mime: 'image/png',
    });
  });

  it('re-encodes a PNG with a script appended, so no variant carries the script', async () => {
    const original = fixture('script.png');
    expect(Buffer.from(original).includes('<script>')).toBe(true);
    const { mediaId } = await uploaded('cover', 'image/png', original);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    const r = await row(mediaId);
    for (const p of Object.values(r.variants ?? {})) {
      const bytes = await storage.read('media-public', p);
      expect(Buffer.from(bytes).includes('<script')).toBe(false);
    }
  });
});

describe('scanMedia: images', () => {
  it('strips EXIF (GPS) from a JPEG and writes 3 WebP variants to media-public', async () => {
    const original = fixture('gps.jpg');
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', original);

    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');

    const r = await row(mediaId);
    expect(r).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
      path: mediaId,
      detected_mime: 'image/jpeg',
      size_bytes: original.byteLength,
      sha256: sha256(original),
      width: 96,
      height: 64,
      alt_text: 'Test image',
    });
    expect(Object.keys(r.variants ?? {}).sort()).toEqual(['1280', '320', '640']);
    for (const p of Object.values(r.variants ?? {})) {
      const meta = await sharp(await storage.read('media-public', p)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(storage.contentType('media-public', p)).toBe('image/webp');
    }
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);

    // The classifier sees the stripped, re-encoded image, and is asked for alt text.
    expect(trust.checks).toHaveLength(1);
    expect(trust.checks[0]).toMatchObject({
      kind: 'image_safety',
      subjectType: 'media',
      subjectId: mediaId,
      wantAltText: true,
      image: { mime: 'image/webp' },
    });
    const sent = trust.checks[0]?.image?.bytes ?? new Uint8Array();
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
  });

  it('asks for alt text only for photos shown on public pages', async () => {
    const { mediaId } = await uploaded('avatar', 'image/png', fixture('gps.png'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(trust.checks[0]?.wantAltText).toBe(false);
    expect((await row(mediaId)).alt_text).toBeNull();
  });

  it('keeps approved image attachments private', async () => {
    const { mediaId } = await uploaded('attachment', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(await row(mediaId)).toMatchObject({ bucket: 'media-private' });
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
  });

  it('blocks a child-safety match: evidence copy, child-safety item, nothing public', async () => {
    const original = fixture('gps.jpg');
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', original);

    expect(await scanMedia(t.db, deps([sha256(original)]), mediaId)).toBe('blocked');

    expect(await row(mediaId)).toMatchObject({ status: 'blocked', bucket: 'evidence' });
    expect([...(await storage.read('evidence', mediaId))]).toEqual([...original]);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(objectsOf('media-private', mediaId)).toEqual([]);
    // The quarantine original is kept too.
    expect(objectsOf('quarantine', mediaId)).toEqual([mediaId]);

    expect(trust.items).toEqual([
      expect.objectContaining({
        queue: 'child_safety',
        subjectType: 'media',
        subjectId: mediaId,
        priority: 1000,
      }),
    ]);
    // Nothing else happens automatically: no AI check.
    expect(trust.checks).toEqual([]);
    const audit = await queryRows<{ action: string }>(
      t.db,
      sql`select action from app.audit_events where subject_id = ${mediaId}`,
    );
    expect(audit).toEqual([{ action: 'media.blocked' }]);
  });

  it('checks an image it cannot decode for child safety first, and blocks a match', async () => {
    const original = corruptJpeg();
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', original);

    expect(await scanMedia(t.db, deps([sha256(original)]), mediaId)).toBe('blocked');

    expect(await row(mediaId)).toMatchObject({ status: 'blocked', bucket: 'evidence' });
    expect([...(await storage.read('evidence', mediaId))]).toEqual([...original]);
    expect(objectsOf('quarantine', mediaId)).toEqual([mediaId]);
    expect(trust.items).toEqual([
      expect.objectContaining({ queue: 'child_safety', subjectType: 'media', subjectId: mediaId }),
    ]);
  });

  it('rejects an image it cannot decode only once the child-safety check has cleared it', async () => {
    const original = corruptJpeg();
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', original);
    const d = deps();
    const hashCheck = vi.spyOn(d.childSafety, 'scanImage');

    expect(await scanMedia(t.db, d, mediaId)).toBe('rejected');

    expect(hashCheck).toHaveBeenCalledWith(original);
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'invalid_image' });
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });

  it('rejects an image nothing can decode as invalid_image with PhotoDNA too', async () => {
    const original = corruptJpeg();
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', original);
    const fetchSpy = vi.fn(async () => Response.json({}));
    const photoDna = photoDnaScanner({ key: 'pdna', fetch: fetchSpy });

    expect(await scanMedia(t.db, { ...deps(), childSafety: photoDna }, mediaId)).toBe('rejected');

    expect(await row(mediaId)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'invalid_image',
    });
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
    expect(trust.items.filter((i) => i.subjectId === mediaId)).toEqual([]);
    expect(trust.checks).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('holds an image PhotoDNA recognises but cannot convert, keeping the original', async () => {
    const { mediaId } = await uploaded('community_photo', 'image/webp', await undecodableWebp());
    const photoDna = photoDnaScanner({ key: 'pdna', fetch: vi.fn(async () => Response.json({})) });

    expect(await scanMedia(t.db, { ...deps(), childSafety: photoDna }, mediaId)).toBe(
      'in_review',
    );
    expect(await row(mediaId)).toMatchObject({ status: 'in_review', bucket: 'quarantine' });
    expect(trust.items.filter((i) => i.subjectId === mediaId)).toEqual([
      expect.objectContaining({ queue: 'moderation', reason: 'child_safety_unscannable' }),
    ]);
  });

  it('holds an image the child-safety scanner cannot read, keeping the original', async () => {
    const original = corruptJpeg();
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', original);
    const unreadable = {
      async scanImage(): Promise<never> {
        throw new UnscannableImageError('cannot read this image');
      },
    };

    expect(await scanMedia(t.db, { ...deps(), childSafety: unreadable }, mediaId)).toBe(
      'in_review',
    );

    expect(await row(mediaId)).toMatchObject({
      status: 'in_review',
      bucket: 'quarantine',
      sha256: sha256(original),
    });
    expect(objectsOf('quarantine', mediaId)).toEqual([mediaId]);
    expect(trust.checks).toEqual([]);
    const item = trust.items.find((i) => i.subjectId === mediaId);
    expect(item).toMatchObject({
      queue: 'moderation',
      subjectType: 'media',
      reason: 'child_safety_unscannable',
    });

    // It is never published unchecked; removing it deletes the original.
    await expect(trust.decide(t.db, item?.id ?? '', 'approve')).rejects.toMatchObject({
      code: 'conflict',
    });
    await trust.decide(t.db, item?.id ?? '', 'remove');
    expect(await row(mediaId)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'removed_by_operator',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });

  it('retries the scan when the child-safety scanner fails for another reason', async () => {
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', fixture('gps.jpg'));
    const down = {
      async scanImage(): Promise<never> {
        throw new Error('PhotoDNA responded 503');
      },
    };
    await expect(scanMedia(t.db, { ...deps(), childSafety: down }, mediaId)).rejects.toThrow(
      '503',
    );
    expect(await row(mediaId)).toMatchObject({ status: 'scanning', bucket: 'quarantine' });
    expect(objectsOf('quarantine', mediaId)).toEqual([mediaId]);
  });

  it('opens one review item when a scan is retried after its check ran', async () => {
    const { mediaId } = await uploaded('housing_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'needs_review');
    const write = vi.spyOn(storage, 'write').mockRejectedValueOnce(new Error('storage is down'));

    try {
      await expect(scanMedia(t.db, deps(), mediaId)).rejects.toThrow('storage is down');
      expect((await row(mediaId)).status).toBe('scanning');
      expect(await scanMedia(t.db, deps(), mediaId)).toBe('in_review');
    } finally {
      write.mockRestore();
    }

    expect(trust.checks).toHaveLength(1);
    expect(trust.items.filter((i) => i.subjectId === mediaId)).toHaveLength(1);
    expect(await row(mediaId)).toMatchObject({ status: 'in_review', alt_text: 'Test image' });
  });

  it('holds a flagged image in review; approving it through decide publishes it', async () => {
    const { mediaId } = await uploaded('housing_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'needs_review');

    expect(await scanMedia(t.db, deps(), mediaId)).toBe('in_review');
    expect(await row(mediaId)).toMatchObject({ status: 'in_review', bucket: 'media-private' });
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);

    const item = trust.items.find((i) => i.subjectId === mediaId);
    expect(item).toMatchObject({ queue: 'moderation', subjectType: 'media' });

    await trust.decide(t.db, item?.id ?? '', 'approve');

    expect(await row(mediaId)).toMatchObject({ status: 'approved', bucket: 'media-public' });
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);

    // The private copies are removed by a job that only runs once the decision committed.
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-private', mediaId)).toEqual([]);
  });

  it('removing a flagged image rejects it and keeps the held copies private', async () => {
    const { mediaId } = await uploaded('meal_photo', 'image/png', fixture('gps.png'));
    trust.verdicts.set(mediaId, 'needs_review');
    await scanMedia(t.db, deps(), mediaId);
    const item = trust.items.find((i) => i.subjectId === mediaId);

    await trust.decide(t.db, item?.id ?? '', 'remove');

    expect(await row(mediaId)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'removed_by_operator',
      bucket: 'media-private',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
  });

  it('an appeal granted on a removed image publishes it again', async () => {
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    const report = await trust.openReviewItem(t.db, {
      queue: 'reports',
      subjectType: 'media',
      subjectId: mediaId,
      reason: 'reported',
    });

    // Removing a published image takes it down; a private copy is kept for an appeal.
    await trust.decide(t.db, report.id, 'remove');
    expect(await row(mediaId)).toMatchObject({ status: 'rejected', bucket: 'media-private' });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);

    const appeal = await trust.openReviewItem(t.db, {
      queue: 'appeals',
      subjectType: 'media',
      subjectId: mediaId,
      reason: 'It is my own photo',
      originalItemId: report.id,
    });
    await trust.decide(t.db, appeal.id, 'approve');

    expect(await row(mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
      rejection_reason: null,
      alt_text: 'Test image',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);
    expect(objectsOf('media-private', mediaId)).toEqual([]);
  });

  it('an operator can overturn the classifier rejecting an image (accuracy sample)', async () => {
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'rejected');
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    const sample = await trust.openReviewItem(t.db, {
      queue: 'audit_sample',
      subjectType: 'media',
      subjectId: mediaId,
      reason: 'Accuracy sample',
    });

    await trust.decide(t.db, sample.id, 'approve');

    expect(await row(mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
      rejection_reason: null,
    });
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);
  });

  it('removing a blocked file confirms the block and keeps the evidence', async () => {
    const original = fixture('gps.jpg');
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', original);
    await scanMedia(t.db, deps([sha256(original)]), mediaId);
    const item = trust.items.find((i) => i.queue === 'child_safety');

    await expect(trust.decide(t.db, item?.id ?? '', 'approve')).rejects.toMatchObject({
      code: 'conflict',
    });
    await trust.decide(t.db, item?.id ?? '', 'remove');
    await runWorker(t.db, { handlers: jobHandlers });

    expect(await row(mediaId)).toMatchObject({ status: 'blocked', bucket: 'evidence' });
    expect([...(await storage.read('evidence', mediaId))]).toEqual([...original]);
    expect(objectsOf('quarantine', mediaId)).toEqual([mediaId]);
  });

  it('refuses to approve while the scan has not finished', async () => {
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', fixture('gps.jpg'));
    const approve = trust.subjects.get('media')?.approve;
    await expect(approve?.(t.db, mediaId)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects an image the classifier rejects, keeping only a private copy', async () => {
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'rejected');
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({
      rejection_reason: 'unsafe_content',
      bucket: 'media-private',
    });
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });
});

describe('scanMedia: PDFs', () => {
  it('rejects a PDF containing EICAR with malware', async () => {
    const { mediaId } = await uploaded('resume', 'application/pdf', pdfWithEicar());
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({
      rejection_reason: 'malware',
      detected_mime: 'application/pdf',
    });
    expect(objectsOf('media-private', mediaId)).toEqual([]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });

  it('approves a clean PDF into media-private', async () => {
    const pdf = fixture('doc.pdf');
    const { mediaId } = await uploaded('resume', 'application/pdf', pdf);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(await row(mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-private',
      path: `${mediaId}.pdf`,
    });
    expect([...(await storage.read('media-private', `${mediaId}.pdf`))]).toEqual([...pdf]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });
});

describe('scanMedia: robustness', () => {
  it('rejects with missing_file when nothing was uploaded', async () => {
    const userId = newId();
    await t.db.execute(
      sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`,
    );
    const { mediaId } = await requestUpload(
      t.db,
      storage,
      { userId },
      {
        kind: 'avatar',
        mime: 'image/png',
        sizeBytes: 100,
      },
    );
    await completeUpload(t.db, { userId }, mediaId);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'missing_file' });
  });

  it('rejects a file larger than its kind allows, whatever was declared', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(fixture('doc.pdf'));
    const userId = newId();
    await t.db.execute(
      sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`,
    );
    const { mediaId } = await requestUpload(
      t.db,
      storage,
      { userId },
      {
        kind: 'resume',
        mime: 'application/pdf',
        sizeBytes: 1000,
      },
    );
    await storage.write('quarantine', mediaId, big, 'application/pdf');
    await completeUpload(t.db, { userId }, mediaId);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'too_large' });
  });

  it('does nothing for a file that is already scanned', async () => {
    const { mediaId } = await uploaded('avatar', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(trust.checks).toHaveLength(1);
  });

  it('runs from the media.scan job queued by completeUpload', async () => {
    const { mediaId } = await uploaded('logo', 'image/png', fixture('gps.png'));
    const result = await runWorker(t.db, { handlers: jobHandlers });
    expect(result).toMatchObject({ processed: 1, retried: 0, dead: 0 });
    expect((await row(mediaId)).status).toBe('approved');
  });

  it('drops a scan job for media that no longer exists instead of retrying it', async () => {
    await expect(
      jobHandlers['media.scan']?.({ mediaId: newId() }, { db: t.db, now: new Date() }),
    ).resolves.toBeUndefined();
  });
});

describe('scanners', () => {
  it('the stub child-safety scanner reads CHILD_SAFETY_STUB_HASHES on every call', async () => {
    const bytes = fixture('gps.jpg');
    const scanner = stubChildSafetyScanner();
    expect((await scanner.scanImage(bytes)).match).toBe(false);
    vi.stubEnv('CHILD_SAFETY_STUB_HASHES', ` deadbeef , ${sha256(bytes).toUpperCase()} `);
    resetEnvCache();
    try {
      expect(await scanner.scanImage(bytes)).toEqual({
        match: true,
        provider: 'stub',
        reference: `sha256:${sha256(bytes)}`,
      });
    } finally {
      vi.stubEnv('CHILD_SAFETY_STUB_HASHES', '');
      resetEnvCache();
    }
  });

  it('the stub malware scanner flags EICAR anywhere in the file', async () => {
    const scanner = stubMalwareScanner();
    expect(await scanner.scanFile(pdfWithEicar(), 'a.pdf')).toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
    expect(await scanner.scanFile(fixture('doc.pdf'), 'b.pdf')).toEqual({ clean: true });
  });

  it('Cloudmersive: sends the file with the API key, reads the verdict, fails closed', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const reply = (status: number, body: unknown) =>
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json(body, { status });
      });

    const infected = cloudmersiveScanner({
      apiKey: 'cm-key',
      fetch: reply(200, {
        CleanResult: false,
        FoundViruses: [{ FileName: 'a', VirusName: 'Eicar' }],
      }),
    });
    expect(await infected.scanFile(fixture('doc.pdf'), 'a.pdf')).toEqual({
      clean: false,
      threat: 'Eicar',
    });
    expect(calls[0]?.url).toBe('https://api.cloudmersive.com/virus/scan/file');
    expect(new Headers(calls[0]?.init?.headers).get('Apikey')).toBe('cm-key');
    expect((calls[0]?.init?.body as FormData).get('inputFile')).toBeInstanceOf(Blob);

    const clean = cloudmersiveScanner({ apiKey: 'k', fetch: reply(200, { CleanResult: true }) });
    expect(await clean.scanFile(fixture('doc.pdf'), 'a.pdf')).toEqual({ clean: true });

    const down = cloudmersiveScanner({ apiKey: 'k', fetch: reply(503, {}) });
    await expect(down.scanFile(fixture('doc.pdf'), 'a.pdf')).rejects.toThrow(/503/);
    const odd = cloudmersiveScanner({ apiKey: 'k', fetch: reply(200, { verdict: 'ok' }) });
    await expect(odd.scanFile(fixture('doc.pdf'), 'a.pdf')).rejects.toThrow();
  });

  it('PhotoDNA: sends the image inline with the key, reads IsMatch, fails closed', async () => {
    let sent: { DataRepresentation: string; Value: string } | undefined;
    let key: string | null = null;
    const reply = (body: unknown) =>
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        key = new Headers(init?.headers).get('Ocp-Apim-Subscription-Key');
        sent = JSON.parse(String(init?.body)) as typeof sent;
        return Response.json(body);
      });

    const ok = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'trk_1' };
    const hit = photoDnaScanner({ key: 'pdna', fetch: reply({ ...ok, IsMatch: true }) });
    const jpg = fixture('gps.jpg');
    expect(await hit.scanImage(jpg)).toEqual({
      match: true,
      provider: 'photodna',
      reference: 'trk_1',
    });
    expect(key).toBe('pdna');
    expect(sent).toEqual({
      DataRepresentation: 'inline',
      Value: Buffer.from(jpg).toString('base64'),
    });

    // A format PhotoDNA does not read is converted (hashes survive re-encoding).
    const webp = new Uint8Array(await sharp(jpg).webp().toBuffer());
    const miss = photoDnaScanner({ key: 'pdna', fetch: reply({ ...ok, IsMatch: false }) });
    expect((await miss.scanImage(webp)).match).toBe(false);
    expect((await sharp(Buffer.from(sent?.Value ?? '', 'base64')).metadata()).format).toBe('png');

    const failing = photoDnaScanner({
      key: 'pdna',
      fetch: reply({ Status: { Code: 3208, Description: 'Bad image' }, IsMatch: false }),
    });
    await expect(failing.scanImage(jpg)).rejects.toThrow(/3208/);
    // A provider error is retried, not treated as an unreadable image.
    await expect(failing.scanImage(jpg)).rejects.not.toBeInstanceOf(UnscannableImageError);
  });

  it('PhotoDNA: an image it recognises but cannot convert is unscannable; nothing is sent', async () => {
    const fetchSpy = vi.fn(async () => Response.json({}));
    const scanner = photoDnaScanner({ key: 'pdna', fetch: fetchSpy });
    await expect(scanner.scanImage(await undecodableWebp())).rejects.toBeInstanceOf(
      UnscannableImageError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PhotoDNA: bytes nothing can read are undecodable, not unscannable; nothing is sent', async () => {
    const fetchSpy = vi.fn(async () => Response.json({}));
    const scanner = photoDnaScanner({ key: 'pdna', fetch: fetchSpy });
    await expect(scanner.scanImage(corruptJpeg())).rejects.toBeInstanceOf(UndecodableImageError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('scanMedia: the uploader is told why a file was rejected (spec section 7, step 4)', () => {
  const told = (userId: string) =>
    queryRows<{ type: string; title: string; body: string; data: Record<string, unknown> }>(
      t.db,
      sql`select type, title, body, data from app.notifications where user_id = ${userId}`,
    );

  it.each([
    ['type_mismatch', 'listing_photo', 'image/jpeg', () => fixture('disguised.jpg')],
    ['malware', 'resume', 'application/pdf', () => pdfWithEicar()],
    ['invalid_image', 'avatar', 'image/jpeg', () => corruptJpeg()],
  ] as const)('%s: a media.rejected notification with the reason', async (reason, kind, mime, bytes) => {
    const { userId, mediaId } = await uploaded(kind, mime, bytes());
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');

    const [note, ...more] = await told(userId);
    expect(more).toEqual([]);
    expect(note).toMatchObject({ type: 'media.rejected', data: { mediaId, kind, reason } });
    expect(note?.body.length).toBeGreaterThan(10);
    expect(note?.body).not.toContain(reason);
  });

  it('unsafe_content: when the classifier rejects an image', async () => {
    const { userId, mediaId } = await uploaded('community_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'rejected');
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await told(userId)).toEqual([
      expect.objectContaining({
        type: 'media.rejected',
        data: { mediaId, kind: 'community_photo', reason: 'unsafe_content' },
      }),
    ]);
  });

  it('only once, however often the scan job runs', async () => {
    const { userId, mediaId } = await uploaded('avatar', 'image/png', fixture('image.svg'));
    await scanMedia(t.db, deps(), mediaId);
    await scanMedia(t.db, deps(), mediaId);
    expect(await told(userId)).toHaveLength(1);
  });

  it('never for an approved file, or a child-safety match (nothing tips the uploader off)', async () => {
    const photo = fixture('gps.jpg');
    const approved = await uploaded('avatar', 'image/jpeg', photo);
    expect(await scanMedia(t.db, deps(), approved.mediaId)).toBe('approved');
    const blocked = await uploaded('community_photo', 'image/jpeg', photo);
    expect(await scanMedia(t.db, deps([sha256(photo)]), blocked.mediaId)).toBe('blocked');
    expect(await told(approved.userId)).toEqual([]);
    expect(await told(blocked.userId)).toEqual([]);
  });
});
